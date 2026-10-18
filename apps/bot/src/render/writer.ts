/** What the story writer tells the DM room: a chapter being written, ready, or a job it couldn't finish. */
import type { StoryJobNotice } from "@dq/db";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder } from "discord.js";
import { encodeId } from "../ids";
import { COLORS, clip, esc, text, V2 } from "./common";

const COLOR: Record<StoryJobNotice["kind"], number> = {
  started: COLORS.calm,
  ready: COLORS.forest,
  retrying: COLORS.quick,
  gave_up: COLORS.crux,
};

export function renderWriterNotice(campaignName: string, jobId: string, notice: StoryJobNotice) {
  const c = new ContainerBuilder().setAccentColor(COLOR[notice.kind]);
  c.addTextDisplayComponents(
    text(`-# 🖋️ Story writer · ${esc(clip(campaignName, 80))}\n${clip(notice.text, 1500)}`),
  );
  if (notice.kind === "gave_up")
    c.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(encodeId({ kind: "writer-retry", jobId }))
          .setLabel("Try again")
          .setEmoji("🔁")
          .setStyle(ButtonStyle.Primary),
      ),
    );
  return { components: [c], flags: V2, allowedMentions: { parse: [] as never[] } };
}
