import type { SceneGalleryEntry } from "@dq/engine";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
} from "discord.js";
import { encodeId } from "../ids";
import { COLORS, clip, esc, text, V2_EPHEMERAL } from "./common";

/** One picture of the campaign's gallery, with buttons to page through and to share it with the table. */
export function renderGallery(args: {
  campaignId: string;
  campaignName: string;
  entry: SceneGalleryEntry;
  index: number;
  total: number;
  words: string[];
  /** The picture's attachment name, or null if its picture can't be found any more. */
  imageName: string | null;
  /** Scenes still without a picture. */
  unpainted: number;
}) {
  const { entry, index, total, words } = args;
  const c = new ContainerBuilder().setAccentColor(COLORS.lantern);
  c.addTextDisplayComponents(
    text(
      `## 🖼️ ${esc(args.campaignName)}\n-# Picture ${index + 1} of ${total}${
        words.length > 0 ? ` · matching “${words.join(" ")}”` : ""
      }`,
    ),
  );
  if (args.imageName)
    c.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL(`attachment://${args.imageName}`)
          .setDescription(clip(entry.title, 1000)),
      ),
    );
  c.addTextDisplayComponents(
    text(
      `**${esc(entry.title)}** · ${esc(entry.locationName)}${entry.chapter ? ` · Chapter ${entry.chapter}` : ""}${
        args.imageName ? "" : "\n-# This picture can't be found any more."
      }`,
    ),
  );
  // Previous and next carry their target page; at either end the button is greyed out (and its id stays unique).
  const page = (to: number, label: string, disabled: boolean) =>
    new ButtonBuilder()
      .setCustomId(encodeId({ kind: "gallery", campaignId: args.campaignId, index: Math.max(0, to), words }))
      .setLabel(label)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled);
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (total > 1)
    row.addComponents(
      page(index - 1, "◀ Previous", index === 0),
      page(index + 1, "Next ▶", index >= total - 1),
    );
  if (args.imageName)
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(encodeId({ kind: "gallery-share", campaignId: args.campaignId, sceneId: entry.sceneId }))
        .setLabel("Share in the thread")
        .setEmoji("📌")
        .setStyle(ButtonStyle.Primary),
    );
  if (row.components.length > 0) c.addActionRowComponents(row);
  if (args.unpainted > 0)
    c.addTextDisplayComponents(
      text(
        `-# ${args.unpainted} scene${args.unpainted === 1 ? " has" : "s have"} no picture yet. The host or DM can run \`/campaign pictures\`.`,
      ),
    );
  return { components: [c], flags: V2_EPHEMERAL };
}
