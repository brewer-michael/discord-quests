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
  /** When the round moves on without the players who haven't chosen. */
  deadline?: Date | null;
}

/** "Waiting on: Pip, Mira · the story moves on in 3 hours" */
export function waitingLine(waitingOn: readonly string[], deadline?: Date | null): string {
  if (waitingOn.length === 0) return "-# Everyone has chosen. The story continues…";
  const when = deadline ? ` · the story moves on <t:${Math.floor(deadline.getTime() / 1000)}:R>` : "";
  return `-# Waiting on: ${waitingOn.map(esc).join(", ")}${when}`;
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
  const header = `## ${view.sceneTitle}\n-# ${view.locationName}${view.fallback ? " · told by the engine while the storyteller rests" : ""}`;
  const narration = clip(view.narration, NARRATION_LIMITS.narration);
  // The story always shows in full; everything else shares what's left, most useful first.
  let left = TEXT_BUDGET - header.length - narration.length;
  const take = (s: string, cap: number) => {
    const room = Math.min(cap, left);
    if (!s || room < 40) return "";
    const out = clip(s, room);
    left -= out.length;
    return out;
  };
  const battle = view.combat ? take(battlePanel(view.combat), 900) : "";
  const rolls = take(view.rolls.map(DICE).join("\n"), 900);
  const voices = take(view.npcLines.map((l) => `> **${esc(l.name)}:** ${l.line}`).join("\n"), 1200);
  const order =
    view.combat?.phase === "fighting" && view.roundId
      ? take(`-# Turn order: ${view.combat.order.map(esc).join(" → ")}`, 300)
      : "";

  c.addTextDisplayComponents(text(header));
  c.addTextDisplayComponents(text(narration));
  if (voices) c.addTextDisplayComponents(text(voices));
  if (rolls) {
    c.addSeparatorComponents(divider());
    c.addTextDisplayComponents(text(rolls));
  }
  if (view.combat) renderBattle(c, view, opts, battle, order);
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
      c.addTextDisplayComponents(text(waitingLine(opts.waitingOn, opts.deadline)));
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

/** A little health bar for heroes: ▰▰▰▱▱. */
function bar(hp: number, max: number): string {
  const filled = max > 0 ? Math.round((Math.max(0, hp) / max) * 5) : 0;
  return "▰".repeat(filled) + "▱".repeat(5 - filled);
}

/** Leaves room for button labels and the "waiting on" line. */
const TEXT_BUDGET = 3650;

function battlePanel(cb: NonNullable<TurnView["combat"]>): string {
  const fighting = cb.phase === "fighting";
  const foes = cb.foes
    .map((f) =>
      f.status === "fighting"
        ? `👾 **${esc(f.name)}**: ${f.condition}`
        : f.status === "at_mercy"
          ? `🏳️ **${esc(f.name)}**: ${f.condition}`
          : `-# ~~${esc(f.name)}~~ ${f.condition}`,
    )
    .join("\n");
  const heroes = cb.heroes
    .map(
      (h) =>
        `${h.down ? "💫" : "🛡️"} **${esc(h.name)}** ${bar(h.hp, h.hpMax)} ${h.hp}/${h.hpMax}${h.down ? " · dazed" : ""}`,
    )
    .join("\n");
  return `### ⚔️ ${fighting ? `Battle · round ${cb.round + 1}` : "The fight is over"}\n${foes}\n\n${heroes}`;
}

function renderBattle(
  c: ContainerBuilder,
  view: TurnView,
  opts: TurnRenderOptions,
  panel: string,
  order: string,
) {
  const cb = view.combat;
  if (!cb) return;
  if (panel) {
    c.addSeparatorComponents(divider());
    c.addTextDisplayComponents(text(panel));
  }
  if (cb.phase !== "fighting" || !view.roundId) return;
  if (order) c.addTextDisplayComponents(text(order));
  const roundId = view.roundId;
  const b = (
    action: "attack" | "magic" | "defend" | "help" | "potion" | "spare",
    label: string,
    emoji: string,
    style: ButtonStyle,
  ) =>
    new ButtonBuilder()
      .setCustomId(encodeId({ kind: "battle", roundId, action }))
      .setLabel(label)
      .setEmoji(emoji)
      .setStyle(style);
  c.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      b("attack", "Attack", "⚔️", ButtonStyle.Danger),
      b("magic", "Magic", "✨", ButtonStyle.Primary),
      b("defend", "Defend", "🛡️", ButtonStyle.Secondary),
      b("help", "Distract", "🤝", ButtonStyle.Secondary),
      b("potion", "Potion", "🧪", ButtonStyle.Secondary),
    ),
  );
  const second = new ActionRowBuilder<ButtonBuilder>();
  if (cb.foes.some((f) => f.status === "at_mercy"))
    second.addComponents(b("spare", "Spare", "🕊️", ButtonStyle.Success));
  second.addComponents(
    new ButtonBuilder()
      .setCustomId(encodeId({ kind: "freeform", roundId }))
      .setLabel("Something else…")
      .setEmoji("✏️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(encodeId({ kind: "resolve", roundId }))
      .setLabel("Next round")
      .setEmoji("⏩")
      .setStyle(ButtonStyle.Success),
  );
  c.addActionRowComponents(second);
  if (opts.waitingOn) {
    c.addTextDisplayComponents(text(waitingLine(opts.waitingOn, opts.deadline)));
  }
}

/** A picture of a scene the story has already been through, painted on request. */
export function renderScenePicture(
  scene: { title: string; locationName: string; kind: string },
  imageName: string,
) {
  const c = new ContainerBuilder()
    .setAccentColor(SCENE_COLOR[scene.kind] ?? SCENE_COLOR.exploration ?? 0)
    .addTextDisplayComponents(text(`🖼️ **${esc(scene.title)}** · ${esc(scene.locationName)}`))
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL(`attachment://${imageName}`)
          .setDescription(clip(scene.title, 1000)),
      ),
    );
  return { components: [c], flags: V2, allowedMentions: { parse: [] } };
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
