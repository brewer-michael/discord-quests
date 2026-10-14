import { GameError, type TurnView } from "@dq/engine";
import type { ButtonInteraction, ChatInputCommandInteraction, ModalSubmitInteraction } from "discord.js";
import { ContainerBuilder } from "discord.js";
import type { BotContext } from "../context";
import { freezeRound, postTurn, sendableChannel } from "../flows";
import type { ApprovalAction } from "../ids";
import { COLORS, esc, text, V2 } from "../render/common";
import { draftModal, renderDecided, renderDraft } from "../render/draft";
import { campaignHere, say } from "./shared";

async function sendApproved(ctx: BotContext, view: TurnView, roundId: string | null) {
  const campaign = await ctx.engine.campaigns.get(view.campaignId);
  const table = await sendableChannel(ctx, campaign?.threadId ?? null);
  if (!table) return;
  if (roundId) await freezeRound(ctx, roundId, table);
  await postTurn(ctx, table, view);
}

export async function approvalButton(
  ctx: BotContext,
  i: ButtonInteraction,
  approvalId: string,
  action: ApprovalAction,
) {
  if (action === "ok") {
    await i.deferUpdate();
    const round = await ctx.engine.turns.draftRound(approvalId);
    const view = await ctx.engine.turns.approveDraft(approvalId, i.user.id);
    await i.editReply(renderDecided("✅ Sent to the table.") as never);
    await sendApproved(ctx, view, round?.roundId ?? null);
    return;
  }
  // Also checks that this person is the campaign's DM.
  const draft = await ctx.engine.turns.getDmDraft(approvalId, i.user.id);
  await i.showModal(draftModal(draft, approvalId, action));
}

export async function approvalModal(
  ctx: BotContext,
  i: ModalSubmitInteraction,
  approvalId: string,
  action: ApprovalAction,
) {
  if (!i.isFromMessage()) return;
  await i.deferUpdate();
  if (action === "redo") {
    const draft = await ctx.engine.turns.regenerateDraft(
      approvalId,
      i.user.id,
      i.fields.getTextInputValue("note") ?? "",
    );
    await i.editReply(renderDraft(draft) as never);
    return;
  }
  const narration = i.fields.getTextInputValue("narration");
  const choices = (i.fields.getTextInputValue("choices") ?? "").split("\n");
  const round = await ctx.engine.turns.draftRound(approvalId);
  const view = await ctx.engine.turns.approveDraft(approvalId, i.user.id, { narration, choices });
  await i.editReply(
    renderDecided(
      action === "edit" ? "✏️ Edited and sent to the table." : "📝 Your version was sent to the table.",
    ) as never,
  );
  await sendApproved(ctx, view, round?.roundId ?? null);
}

export async function dmCommand(ctx: BotContext, i: ChatInputCommandInteraction) {
  const c = await campaignHere(ctx, i);
  await ctx.engine.dm.requireDm(c.id, i.user.id);
  const sub = i.options.getSubcommand();
  if (sub === "say") {
    const table = await sendableChannel(ctx, c.threadId);
    const words = i.options.getString("text", true);
    await table?.send({
      components: [
        new ContainerBuilder().setAccentColor(COLORS.lantern).addTextDisplayComponents(text(`📜 ${words}`)),
      ],
      flags: V2,
      allowedMentions: { parse: [] },
    } as never);
    await say(i, "Posted to the table.");
  }
}

export async function loomCommand(ctx: BotContext, i: ChatInputCommandInteraction) {
  const c = await campaignHere(ctx, i);
  const sub = i.options.getSubcommand();
  if (sub === "view") {
    const v = await ctx.engine.dm.loomView(c.id, i.user.id);
    await say(
      i,
      [
        "## 🕯️ The hidden hand",
        `**Threads** (kindness, mercy and patience waiting to matter):\n${
          v.threads
            .map(
              (t) =>
                `- ${t.state === "woven" ? "✨" : t.state === "ripe" ? "🌕" : t.state === "budding" ? "🌗" : "🌑"} ${esc(t.deed)}${t.anchor ? ` (${esc(t.anchor)})` : ""}${t.reservedForFinale ? " · kept for the finale" : ""}`,
            )
            .join("\n") || "- none yet"
        }`,
        `**Snares** (shortcuts that will come back around):\n${v.snares.map((s) => `- ${s.state === "unknotted" ? "🪢 undone" : s.state === "sprung" ? "💥 sprung" : "⏳"} ${esc(s.deed)}: ${esc(s.hint)}`).join("\n") || "- none"}`,
        `**Bearers** (kept safe and nearby): ${v.bearers.map((b) => `${esc(b.name)} (${b.presence.replaceAll("_", " ")})`).join(", ") || "none"}`,
        `**Quiet-hand detours:** ${v.detours.map((d) => `${d.template} → ${d.target} (${d.state.replaceAll("_", " ")})`).join(", ") || "none"}`,
      ].join("\n"),
    );
    return;
  }
  if (sub === "plant") {
    const who = i.options.getString("who");
    const { index } = ctx.worlds.get(c.worldId);
    const npc = who
      ? index.world.npcs.named.find(
          (n) => n.id === who.toLowerCase() || n.name.toLowerCase() === who.toLowerCase(),
        )
      : null;
    if (who && !npc) throw new GameError("unknown npc", `I don't know anyone called "${who}" in this world.`);
    await ctx.engine.dm.plant(c.id, i.user.id, {
      tag: i.options.getString("kind", true),
      npcId: npc?.id ?? null,
      summary: i.options.getString("what", true),
      size: (i.options.getString("weight") ?? "medium") as "small" | "medium" | "large",
    });
    await say(i, "Planted. It will ripen as the story goes on.");
    return;
  }
  if (sub === "mode") {
    const mode = i.options.getString("mode", true) as "auto" | "off";
    await ctx.engine.dm.setLoomMode(c.id, i.user.id, mode);
    await say(
      i,
      mode === "off"
        ? "The hidden hand is switched off. You're in full control."
        : "The hidden hand is back on.",
    );
  }
}
