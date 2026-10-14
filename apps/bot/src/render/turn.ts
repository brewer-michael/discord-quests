import { NARRATION_LIMITS } from "@dq/core/narration";
import type { TurnView } from "@dq/engine";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
} from "discord.js";
import { encodeId } from "../ids";
import { clip, divider, esc, SCENE_COLOR, text, V2 } from "./common";

const DICE = (r: TurnView["rolls"][number]) => {
  const modeNote =
    r.mode === "advantage" ? " (advantage)" : r.mode === "disadvantage" ? " (disadvantage)" : "";
  const mod = r.modifier >= 0 ? `+${r.modifier}` : `${r.modifier}`;
  return `🎲 **${esc(r.characterName)}**: ${r.label}${modeNote}: ${r.rolls.join("/")} ${mod} = **${r.total}** vs ${r.difficulty} ${r.success ? "✅" : "❌"}`;
};

export interface TurnRenderOptions {
  waitingOn?: string[];
  image?: { name: string } | null;
}

/** The main story message: narration, voices, dice, and what the heroes can do next. */
export function renderTurn(view: TurnView, opts: TurnRenderOptions = {}) {
  const c = new ContainerBuilder().setAccentColor(SCENE_COLOR[view.sceneKind] ?? 0xf2b84b);
  if (opts.image) {
    c.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL(`attachment://${opts.image.name}`)
          .setDescription(view.sceneTitle),
      ),
    );
  }
  c.addTextDisplayComponents(
    text(
      `## ${view.sceneTitle}\n-# ${view.locationName}${view.fallback ? " · told by the engine while the storyteller rests" : ""}`,
    ),
  );
  c.addTextDisplayComponents(text(clip(view.narration, NARRATION_LIMITS.narration)));
  if (view.npcLines.length > 0) {
    c.addTextDisplayComponents(text(view.npcLines.map((l) => `> **${esc(l.name)}:** ${l.line}`).join("\n")));
  }
  if (view.rolls.length > 0) {
    c.addSeparatorComponents(divider());
    c.addTextDisplayComponents(text(view.rolls.map(DICE).join("\n")));
  }
  if (view.roundId && view.choices.length > 0) {
    c.addSeparatorComponents(divider());
    c.addTextDisplayComponents(text("**What do you do?**"));
    c.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        view.choices.slice(0, 4).map((ch) =>
          new ButtonBuilder()
            .setCustomId(encodeId({ kind: "choice", roundId: view.roundId as string, index: ch.index }))
            .setLabel(clip(ch.label, 80))
            .setStyle(ButtonStyle.Primary),
        ),
      ),
    );
    c.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(encodeId({ kind: "freeform", roundId: view.roundId }))
          .setLabel("Something else…")
          .setEmoji("✏️")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(encodeId({ kind: "pass", roundId: view.roundId }))
          .setLabel("Watch and wait")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(encodeId({ kind: "resolve", roundId: view.roundId }))
          .setLabel("Continue the story")
          .setEmoji("⏩")
          .setStyle(ButtonStyle.Success),
      ),
    );
    if (opts.waitingOn) {
      c.addTextDisplayComponents(
        text(
          opts.waitingOn.length > 0
            ? `-# Waiting on: ${opts.waitingOn.map(esc).join(", ")}`
            : "-# Everyone has chosen. The story continues…",
        ),
      );
    }
  }
  if (view.campaignEnded) {
    c.addSeparatorComponents(divider(true));
    c.addTextDisplayComponents(
      text("### The End\nThank you for playing. Start a new adventure any time with `/campaign new`."),
    );
  } else {
    c.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(encodeId({ kind: "sheet", campaignId: view.campaignId }))
          .setLabel("My hero")
          .setEmoji("🧙")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(encodeId({ kind: "map", campaignId: view.campaignId }))
          .setLabel("Map")
          .setEmoji("🗺️")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(encodeId({ kind: "xcard", campaignId: view.campaignId }))
          .setLabel("Not this")
          .setEmoji("✋")
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  }
  return { components: [c], flags: V2, allowedMentions: { parse: [] as never[] } };
}

export function sceneAttachment(bytes: Buffer, mime: string) {
  const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
  const name = `scene.${ext}`;
  return { name, file: new AttachmentBuilder(bytes, { name, description: "Scene illustration" }) };
}

/**
 * A finished round's message keeps its story but loses its buttons. Works on
 * the JSON of an existing Components V2 message.
 */
export function freezeComponents(components: unknown[]): unknown[] {
  const strip = (node: unknown): unknown => {
    if (!node || typeof node !== "object") return node;
    const o = { ...(node as Record<string, unknown>) };
    delete o.id;
    if (Array.isArray(o.components)) {
      o.components = (o.components as unknown[])
        .filter((ch) => (ch as { type?: number }).type !== 1)
        .filter((ch) => {
          const t = ch as { type?: number; content?: string };
          return !(
            t.type === 10 &&
            (t.content?.startsWith("**What do you do?**") ||
              t.content?.startsWith("-# Waiting on") ||
              t.content?.startsWith("-# Everyone has chosen"))
          );
        })
        .map(strip);
    }
    return o;
  };
  return components.map(strip);
}
