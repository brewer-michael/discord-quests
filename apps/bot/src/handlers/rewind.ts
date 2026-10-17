/**
 * DM tools, from the DM room only. The host, a DM or a guardian mentions the bot there ("@Discord Quests
 * rewind 2 turns, the wolf fight went wrong") and gets the card: rewind, mend, rebuild, and the fight rules.
 * Nothing about it is shown at the table until something actually changes. Mentions and clicks anywhere else
 * are ignored.
 */
import { GameError } from "@dq/engine";
import type { ButtonInteraction, Message, StringSelectMenuInteraction } from "discord.js";
import type { BotContext } from "../context";
import { freezeRound, postTurn, sendableChannel } from "../flows";
import type { CustomId } from "../ids";
import { notice, V2 } from "../render/common";
import { type RewindInfo, renderRewindCard, renderRewindConfirm, renderRewindDone } from "../render/rewind";
import { refreshHub } from "./shared";

/** The DM room itself, or a thread inside it (the DM screens). */
async function inDmRoom(
  ctx: BotContext,
  guildId: string,
  channel: { id: string; isThread(): boolean; parentId?: string | null },
) {
  const dm = (await ctx.engine.campaigns.rooms(guildId)).dm?.id;
  if (!dm) return false;
  return channel.id === dm || (channel.isThread() && channel.parentId === dm);
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

/** "rewind 2 turns", "go back three rounds", "undo the last turn". */
export function turnsAsked(text: string): number | null {
  const m =
    /\b(\d{1,2}|an?|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:more\s+)?(?:turns?|rounds?)\b/i.exec(
      text,
    );
  if (m) {
    const word = (m[1] ?? "").toLowerCase();
    const n = Number(word) || NUMBER_WORDS[word] || 0;
    return n > 0 ? n : null;
  }
  return /\b(last|previous)\s+(turn|round)\b/i.test(text) ? 1 : null;
}

async function info(ctx: BotContext, campaignId: string, userId: string): Promise<RewindInfo> {
  return ctx.engine.turns.rewindPoints(campaignId, userId);
}

/** Which campaign a mention in the DM room means: its DM screen's, the only one they run, or the one named. */
async function campaignFor(ctx: BotContext, message: Message<true>): Promise<string | string[] | null> {
  if (message.channel.isThread()) {
    const c = await ctx.engine.campaigns.findByThread(message.channel.id);
    if (c && c.status !== "setup" && (await ctx.engine.campaigns.canSupervise(c.id, message.author.id)))
      return c.id;
  }
  const running = (await ctx.engine.campaigns.listForGuild(message.guildId)).filter(
    (c) => c.status !== "setup",
  );
  const mine: typeof running = [];
  for (const c of running) if (await ctx.engine.campaigns.canSupervise(c.id, message.author.id)) mine.push(c);
  if (mine.length === 0) return null;
  if (mine.length === 1) return (mine[0] as (typeof mine)[number]).id;
  const said = message.content.toLowerCase();
  const named = mine.filter((c) => said.includes(c.name.toLowerCase()));
  return named.length === 1 ? (named[0] as (typeof named)[number]).id : mine.map((c) => c.name);
}

export async function rewindMention(ctx: BotContext, message: Message) {
  const me = ctx.client.user;
  if (!me || message.author.bot || !message.inGuild() || !message.mentions.users.has(me.id)) return;
  if (!(await inDmRoom(ctx, message.guildId, message.channel))) return;
  const which = await campaignFor(ctx, message);
  if (which === null) {
    await message.reply({
      content: "Only the host, a DM or a guardian of a running campaign can rewind it.",
      allowedMentions: { repliedUser: false },
    });
    return;
  }
  if (Array.isArray(which)) {
    await message.reply({
      content: `Which campaign? Mention me again with its name: ${which.join(", ")}.`,
      allowedMentions: { repliedUser: false },
    });
    return;
  }
  try {
    const card = await info(ctx, which, message.author.id);
    const back = turnsAsked(message.content);
    const target = back ? card.points.find((p) => p.turnsBack === back) : undefined;
    const payload = target ? renderRewindConfirm(card, target.turnSeq) : renderRewindCard(card);
    await message.reply({ ...payload, allowedMentions: { parse: [], repliedUser: false } } as never);
  } catch (e) {
    await message.reply({
      content: e instanceof GameError ? e.userMessage : "I couldn't open the rewind card just now.",
      allowedMentions: { repliedUser: false },
    });
  }
}

/** Tells the table what changed, in the campaign's own thread. */
async function toTable(ctx: BotContext, campaignId: string, line: string) {
  const c = await ctx.engine.campaigns.get(campaignId);
  const ch = await sendableChannel(ctx, c?.threadId ?? null);
  if (ch) await ch.send({ ...notice(line), flags: V2 } as never);
  return ch;
}

export async function rewindInteraction(
  ctx: BotContext,
  i: ButtonInteraction | StringSelectMenuInteraction,
  id: Extract<CustomId, { kind: "rewind" }>,
) {
  if (!i.inGuild() || !i.channel || !(await inDmRoom(ctx, i.guildId, i.channel))) return;
  const { campaignId } = id;
  const card = async (problem?: string) => renderRewindCard(await info(ctx, campaignId, i.user.id), problem);
  try {
    switch (id.action) {
      case "pick": {
        if (!i.isStringSelectMenu()) return;
        const seq = Number(i.values[0]);
        await i.update(renderRewindConfirm(await info(ctx, campaignId, i.user.id), seq) as never);
        return;
      }
      case "back":
        await i.update((await card()) as never);
        return;
      case "cancel":
        await i.update(renderRewindDone("Nothing was changed.") as never);
        return;
      case "go": {
        if (id.seq === undefined) return;
        await i.deferUpdate();
        const open = await ctx.engine.turns.currentRound(campaignId);
        const { view, undone } = await ctx.engine.turns.rewind(campaignId, i.user.id, id.seq);
        const steps = undone === 1 ? "a turn" : `${undone} turns`;
        const ch = await toTable(
          ctx,
          campaignId,
          `⏪ **The story steps back ${steps}.** The DM has set things right; here's where it picks up.`,
        );
        if (ch) {
          if (open) await freezeRound(ctx, open.id, ch);
          await postTurn(ctx, ch, view);
        }
        await refreshHub(ctx, campaignId).catch(() => {});
        await i.editReply(renderRewindDone(`✅ Rewound ${steps}. The table has the scene again.`) as never);
        return;
      }
      case "mend": {
        await i.deferUpdate();
        const names = await ctx.engine.turns.mendParty(campaignId, i.user.id);
        await toTable(
          ctx,
          campaignId,
          `🌿 **${names.join(", ")} catch${names.length === 1 ? "es" : ""} their breath.** Everyone is back to full strength.`,
        );
        await i.editReply(renderRewindDone(`✅ Mended: ${names.join(", ")}.`) as never);
        return;
      }
      case "rebuild": {
        await i.deferUpdate();
        const open = await ctx.engine.turns.currentRound(campaignId);
        const view = await ctx.engine.turns.rebuildFight(campaignId, i.user.id);
        const c = await ctx.engine.campaigns.get(campaignId);
        const ch = await sendableChannel(ctx, c?.threadId ?? null);
        if (ch) {
          if (open) await freezeRound(ctx, open.id, ch);
          await postTurn(ctx, ch, view);
        }
        await i.editReply(renderRewindDone("✅ The fight was rebuilt for the party as it stands.") as never);
        return;
      }
      case "graze-on":
      case "graze-off": {
        await i.deferUpdate();
        const on = id.action === "graze-on";
        await ctx.engine.turns.setPartialHits(campaignId, i.user.id, on);
        await toTable(
          ctx,
          campaignId,
          on
            ? "⚔️ **New fight rules:** an attack that only just misses still grazes, a miss builds ✨ Courage for a second try, and every foe has a weak spot. Watch for it: shoving, tricking or scaring a foe each works on a different weakness."
            : "⚔️ **The fight rules are back to standard:** a miss is a miss.",
        );
        await i.editReply((await card()) as never);
        return;
      }
    }
  } catch (e) {
    if (!(e instanceof GameError)) throw e;
    const payload = await card(e.userMessage);
    if (i.deferred || i.replied) await i.editReply(payload as never);
    else await i.update(payload as never);
  }
}
