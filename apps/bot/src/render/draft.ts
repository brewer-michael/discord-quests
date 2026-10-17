import { NARRATION_LIMITS } from "@dq/core/narration";
import type { DmDraft } from "@dq/engine";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  LabelBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { type ApprovalAction, encodeId } from "../ids";
import { COLORS, clip, divider, esc, prefill, text, V2 } from "./common";

/** Discord allows 4000 characters of text per message; leave room for the buttons. */
const TEXT_BUDGET = 3850;

/** The DM's private preview of the next turn, with the hidden hand's notes. */
export function renderDraft(d: DmDraft) {
  const header = `## 📝 Draft: ${esc(d.sceneTitle)}\n-# Turn ${d.seq}${d.fallback ? " · written by the engine (no AI available)" : ""}`;
  const narration = clip(d.narration, NARRATION_LIMITS.narration);
  const choices =
    d.choices.length > 0
      ? `**Choices:**\n${d.choices.map((x, i) => `${i + 1}. ${esc(clip(x, 80))}`).join("\n")}`
      : "";
  // The story and the choices are what the DM approves, so they always show in full.
  // Everything else shares what's left, most useful first.
  let left = TEXT_BUDGET - header.length - narration.length - choices.length;
  const take = (s: string, cap: number) => {
    const room = Math.min(cap, left);
    if (!s || room < 40) return "";
    const out = clip(s, room);
    left -= out.length;
    return out;
  };
  const notes = take(
    d.dmNotes.length > 0
      ? `**🕯️ The hidden hand (only you can see this)**\n${d.dmNotes.map((n) => `- ${n}`).join("\n")}`
      : "",
    900,
  );
  const rolls = take(
    d.rolls
      .map(
        (r) =>
          `${r.foe ? "👾" : "🎲"} ${esc(r.characterName)}: ${r.label} ${r.total} vs ${r.difficulty} ${r.success ? "✅" : "❌"}${r.difficulty.startsWith("defense ") && r.natural === 20 ? " 💥 critical" : ""}${r.damage ? ` ${r.damage} damage` : ""}`,
      )
      .join("\n"),
    500,
  );
  const voices = take(d.npcLines.map((l) => `> ${l}`).join("\n"), 1200);
  const actions = take(
    d.actions.length > 0 ? `**The heroes:** ${d.actions.map((a) => esc(a)).join("; ")}` : "",
    500,
  );

  const c = new ContainerBuilder().setAccentColor(COLORS.quick);
  c.addTextDisplayComponents(text(header));
  if (actions) c.addTextDisplayComponents(text(actions));
  if (rolls) c.addTextDisplayComponents(text(rolls));
  c.addSeparatorComponents(divider());
  c.addTextDisplayComponents(text(narration));
  if (voices) c.addTextDisplayComponents(text(voices));
  if (choices) c.addTextDisplayComponents(text(choices));
  if (notes) {
    c.addSeparatorComponents(divider());
    c.addTextDisplayComponents(text(notes));
  }
  const button = (action: ApprovalAction, label: string, emoji: string, style: ButtonStyle) =>
    new ButtonBuilder()
      .setCustomId(encodeId({ kind: "approval", approvalId: d.approvalId, action }))
      .setLabel(label)
      .setEmoji(emoji)
      .setStyle(style);
  c.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      button("ok", "Send it", "✅", ButtonStyle.Success),
      button("edit", "Edit", "✏️", ButtonStyle.Primary),
      button("redo", "Redo with a note", "🔁", ButtonStyle.Secondary),
      button("write", "Write my own", "📝", ButtonStyle.Secondary),
    ),
  );
  return { components: [c], flags: V2, allowedMentions: { parse: [] as never[] } };
}

export function renderDecided(label: string) {
  return {
    components: [
      new ContainerBuilder().setAccentColor(COLORS.calm).addTextDisplayComponents(text(`-# ${label}`)),
    ],
    flags: V2,
  };
}

export function draftModal(d: DmDraft | null, approvalId: string, action: ApprovalAction) {
  const modal = new ModalBuilder().setCustomId(encodeId({ kind: "approval-modal", approvalId, action }));
  if (action === "redo") {
    return modal
      .setTitle("Redo this turn")
      .addLabelComponents(
        new LabelBuilder()
          .setLabel("A note for the storyteller")
          .setDescription("e.g. make it spookier, give Hattie more to say")
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId("note")
              .setStyle(TextInputStyle.Paragraph)
              .setMaxLength(500)
              .setRequired(false),
          ),
      );
  }
  return modal
    .setTitle(action === "edit" ? "Edit this turn" : "Write this turn yourself")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Narration")
        .setTextInputComponent(
          prefill(
            new TextInputBuilder()
              .setCustomId("narration")
              .setStyle(TextInputStyle.Paragraph)
              .setMinLength(10)
              .setMaxLength(NARRATION_LIMITS.narration)
              .setRequired(true),
            action === "edit" && d ? d.narration.slice(0, NARRATION_LIMITS.narration) : "",
          ),
        ),
      new LabelBuilder()
        .setLabel("Choices (one per line, up to 4)")
        .setTextInputComponent(
          prefill(
            new TextInputBuilder()
              .setCustomId("choices")
              .setStyle(TextInputStyle.Paragraph)
              .setMaxLength(400)
              .setRequired(false),
            d ? d.choices.join("\n").slice(0, 400) : "",
          ),
        ),
    );
}
