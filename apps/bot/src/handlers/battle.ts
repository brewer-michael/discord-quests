import type { ChosenAction } from "@dq/core/combat";
import {
  ActionRowBuilder,
  type ButtonInteraction,
  ContainerBuilder,
  StringSelectMenuBuilder,
  type StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import type { BotContext } from "../context";
import { refreshWaiting, resolveAndPost } from "../flows";
import { type BattleAction, encodeId } from "../ids";
import { COLORS, clip, esc, text, V2_EPHEMERAL } from "../render/common";
import { say } from "./shared";

type Options = NonNullable<Awaited<ReturnType<BotContext["engine"]["turns"]["combatOptions"]>>>;
type Pick = { label: string; value: string; description?: string; emoji?: string };

/** A private "which one?" menu for a battle action. */
export function battleMenu(
  roundId: string,
  action: BattleAction,
  arg: string | undefined,
  prompt: string,
  picks: Pick[],
) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(encodeId({ kind: "battle-pick", roundId, action, ...(arg ? { arg } : {}) }))
    .setPlaceholder(clip(prompt, 150))
    .addOptions(
      picks.slice(0, 25).map((p) => {
        const o = new StringSelectMenuOptionBuilder().setLabel(clip(p.label, 100)).setValue(p.value);
        if (p.description) o.setDescription(clip(p.description, 100));
        if (p.emoji) o.setEmoji(p.emoji);
        return o;
      }),
    );
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(COLORS.lantern)
        .addTextDisplayComponents(text(`**${esc(prompt)}**`))
        .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)),
    ],
    flags: V2_EPHEMERAL,
  };
}

function confirmation(message: string) {
  return {
    components: [new ContainerBuilder().setAccentColor(COLORS.calm).addTextDisplayComponents(text(message))],
    flags: V2_EPHEMERAL,
  };
}

async function submit(
  ctx: BotContext,
  i: ButtonInteraction | StringSelectMenuInteraction,
  roundId: string,
  action: ChosenAction,
  what: string,
) {
  const res = await ctx.engine.turns.submitAction({
    roundId,
    userId: i.user.id,
    kind: "combat",
    action,
    interactionId: i.id,
  });
  const message = !res.ok
    ? res.message
    : "deflection" in res
      ? `*${res.deflection}*`
      : `${what}${res.allSubmitted ? "" : ` Waiting on: ${res.waitingOn.map(esc).join(", ")}.`}`;
  if (i.isStringSelectMenu()) await i.update(confirmation(message) as never);
  else await say(i, message);
  if (!res.ok || "deflection" in res) return;
  const ch = i.channel?.isSendable() ? i.channel : null;
  if (!ch) return;
  if (res.allSubmitted) await resolveAndPost(ctx, roundId, ch);
  else await refreshWaiting(ctx, roundId, ch);
}

async function show(
  i: ButtonInteraction | StringSelectMenuInteraction,
  payload: ReturnType<typeof battleMenu>,
) {
  if (i.isStringSelectMenu()) await i.update(payload as never);
  else await i.reply(payload as never);
}

const foePicks = (o: Options): Pick[] =>
  o.foes.map((f) => ({ label: f.name, value: f.id, description: f.condition, emoji: "👾" }));
const allyPicks = (o: Options): Pick[] =>
  o.allies.map((a) => ({
    label: a.name,
    value: a.id,
    description: `${a.hp}/${a.hpMax} hit points${a.hp <= 0 ? ", dazed" : ""}`,
  }));
const nameOf = (list: Array<{ id: string; name: string }>, id: string | undefined) =>
  esc(list.find((x) => x.id === id)?.name ?? "them");

async function onFoe(
  ctx: BotContext,
  i: ButtonInteraction | StringSelectMenuInteraction,
  roundId: string,
  o: Options,
  action: "attack" | "help",
) {
  const verb = action === "attack" ? "attack" : "distract";
  const make = (targetId: string): ChosenAction => ({ kind: action, targetId });
  if (o.foes.length === 1) {
    const f = o.foes[0] as Options["foes"][number];
    return submit(ctx, i, roundId, make(f.id), `You'll ${verb} **${esc(f.name)}**.`);
  }
  await show(i, battleMenu(roundId, action, undefined, `Which foe will you ${verb}?`, foePicks(o)));
}

export async function battleButton(
  ctx: BotContext,
  i: ButtonInteraction,
  roundId: string,
  action: BattleAction,
) {
  const o = await ctx.engine.turns.combatOptions(roundId, i.user.id);
  if (!o) return say(i, "That fight has moved on, or you don't have a hero in it.");
  if (o.down)
    return submit(
      ctx,
      i,
      roundId,
      { kind: "defend" },
      "You're dazed! On your turn you'll try to Rally and get back up.",
    );
  switch (action) {
    case "defend":
      return submit(
        ctx,
        i,
        roundId,
        { kind: "defend" },
        "You raise your guard. Foes will find you harder to hit.",
      );
    case "attack":
    case "help":
      return onFoe(ctx, i, roundId, o, action);
    case "spare": {
      if (o.atMercy.length === 0) return say(i, "No foe has given up yet.");
      if (o.atMercy.length === 1) {
        const f = o.atMercy[0] as Options["atMercy"][number];
        return submit(
          ctx,
          i,
          roundId,
          { kind: "spare", targetId: f.id },
          `You'll let **${esc(f.name)}** go free.`,
        );
      }
      return show(
        i,
        battleMenu(
          roundId,
          "spare",
          undefined,
          "Who will you let go?",
          o.atMercy.map((f) => ({ label: f.name, value: f.id, emoji: "🏳️" })),
        ),
      );
    }
    case "magic": {
      const ready = o.spells.filter((s) => s.available);
      if (o.spells.length === 0)
        return say(i, "Your hero doesn't know any battle magic. Try ⚔️ Attack, or ✏️ Something else!");
      if (ready.length === 0)
        return say(i, "Your magic is all used up until you rest. Try ⚔️ Attack instead!");
      return show(
        i,
        battleMenu(
          roundId,
          "magic",
          undefined,
          "Which spell?",
          ready.map((s) => ({
            label: s.name,
            value: s.id,
            description:
              s.level === 0
                ? "A cantrip: use it as often as you like"
                : `Uses some of your magic (level ${s.level})`,
            emoji: s.target === "ally" ? "💚" : s.target === "self" ? "🌟" : "✨",
          })),
        ),
      );
    }
    case "potion": {
      if (o.potions.length === 0) return say(i, "You don't have a healing potion.");
      if (o.potions.length === 1)
        return pickPotionTarget(ctx, i, roundId, o, (o.potions[0] as Options["potions"][number]).itemId);
      return show(
        i,
        battleMenu(
          roundId,
          "potion",
          undefined,
          "Which potion?",
          o.potions.map((p) => ({
            label: p.name,
            value: p.itemId,
            description: `You have ${p.qty}`,
            emoji: "🧪",
          })),
        ),
      );
    }
  }
}

async function pickPotionTarget(
  ctx: BotContext,
  i: ButtonInteraction | StringSelectMenuInteraction,
  roundId: string,
  o: Options,
  itemId: string,
) {
  const name = esc(o.potions.find((p) => p.itemId === itemId)?.name ?? "the potion");
  if (o.allies.length === 1)
    return submit(
      ctx,
      i,
      roundId,
      { kind: "item", itemId, targetId: (o.allies[0] as Options["allies"][number]).id },
      `You'll drink ${name}.`,
    );
  await show(i, battleMenu(roundId, "potion", itemId, `Who gets ${name}?`, allyPicks(o)));
}

export async function battlePick(
  ctx: BotContext,
  i: StringSelectMenuInteraction,
  roundId: string,
  action: BattleAction,
  arg: string | undefined,
) {
  const value = i.values[0] ?? "";
  const o = await ctx.engine.turns.combatOptions(roundId, i.user.id);
  if (!o) return i.update(confirmation("That fight has moved on.") as never);
  switch (action) {
    case "attack":
      return submit(
        ctx,
        i,
        roundId,
        { kind: "attack", targetId: value },
        `You'll attack **${nameOf(o.foes, value)}**.`,
      );
    case "help":
      return submit(
        ctx,
        i,
        roundId,
        { kind: "help", targetId: value },
        `You'll distract **${nameOf(o.foes, value)}**.`,
      );
    case "spare":
      return submit(
        ctx,
        i,
        roundId,
        { kind: "spare", targetId: value },
        `You'll let **${nameOf(o.atMercy, value)}** go free.`,
      );
    case "potion":
      if (!arg) return pickPotionTarget(ctx, i, roundId, o, value);
      return submit(
        ctx,
        i,
        roundId,
        { kind: "item", itemId: arg, targetId: value },
        `You'll give the potion to **${nameOf(o.allies, value)}**.`,
      );
    case "magic": {
      if (arg) {
        const spell = o.spells.find((s) => s.id === arg);
        const who = spell?.target === "ally" ? nameOf(o.allies, value) : nameOf(o.foes, value);
        return submit(
          ctx,
          i,
          roundId,
          { kind: "cast", spellId: arg, targetId: value },
          `You'll cast **${esc(spell?.name ?? "it")}** on **${who}**.`,
        );
      }
      const spell = o.spells.find((s) => s.id === value);
      if (!spell) return i.update(confirmation("That spell isn't ready.") as never);
      const cast = (targetId?: string) => ({
        kind: "cast" as const,
        spellId: spell.id,
        ...(targetId ? { targetId } : {}),
      });
      if (spell.target === "self")
        return submit(ctx, i, roundId, cast(), `You'll cast **${esc(spell.name)}**.`);
      if (spell.target === "ally") {
        if (o.allies.length === 1)
          return submit(ctx, i, roundId, cast(o.allies[0]?.id), `You'll cast **${esc(spell.name)}**.`);
        return show(i, battleMenu(roundId, "magic", spell.id, `Who gets ${spell.name}?`, allyPicks(o)));
      }
      if (o.foes.length === 1) {
        const f = o.foes[0] as Options["foes"][number];
        return submit(
          ctx,
          i,
          roundId,
          cast(f.id),
          `You'll cast **${esc(spell.name)}** at **${esc(f.name)}**.`,
        );
      }
      return show(i, battleMenu(roundId, "magic", spell.id, `Cast ${spell.name} at which foe?`, foePicks(o)));
    }
    case "defend":
      return submit(ctx, i, roundId, { kind: "defend" }, "You raise your guard.");
  }
}
