import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder } from "discord.js";
import { encodeId } from "../ids";
import { COLORS, divider, esc, text, V2 } from "./common";

export interface HubInfo {
  campaignId: string;
  name: string;
  worldName: string;
  tagline: string;
  mode: "ai_dm" | "assist";
  dmUserId: string | null;
  status: string;
  audience: "family" | "teen";
  heroes: Array<{ name: string; userId: string; ready: boolean }>;
}

export const FAMILY_NOTICE =
  "-# 👪 Family table: Discord requires players to be 13 or older. Younger adventurers should play with a parent or guardian, on the grown-up's account or at the same table. The story will never ask for real names, ages or where anyone lives.";

/** The pinned welcome message at the top of each campaign thread. */
export function renderHub(info: HubInfo) {
  const c = new ContainerBuilder().setAccentColor(COLORS.lantern);
  c.addTextDisplayComponents(
    text(`# ${esc(info.name)}\n*${esc(info.tagline)}*\n-# A tale of ${esc(info.worldName)}`),
  );
  c.addTextDisplayComponents(
    text(
      [
        `**Storyteller:** ${info.mode === "ai_dm" ? "Old Wick (the bot) runs the story" : `<@${info.dmUserId}> runs the story, with the bot's help`}`,
        `**Status:** ${info.status === "setup" ? "Gathering heroes" : info.status === "active" ? "Adventure in progress" : info.status}`,
        `**Heroes:** ${
          info.heroes.length === 0
            ? "none yet"
            : info.heroes
                .map((h) => `${h.ready ? "🟢" : "🟡"} ${esc(h.name || "(unnamed)")} (<@${h.userId}>)`)
                .join(" · ")
        }`,
      ].join("\n"),
    ),
  );
  if (info.audience === "family") c.addTextDisplayComponents(text(FAMILY_NOTICE));
  c.addSeparatorComponents(divider());
  c.addTextDisplayComponents(
    text(
      "**How to play:** join, make your hero, then the host starts the adventure. Each turn, pick a choice or describe something else. Use **Not this** any time to quietly steer the story elsewhere.",
    ),
  );
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(encodeId({ kind: "join", campaignId: info.campaignId }))
      .setLabel("Join")
      .setEmoji("🙋")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(encodeId({ kind: "create", campaignId: info.campaignId }))
      .setLabel("Make my hero")
      .setEmoji("🧙")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(encodeId({ kind: "map", campaignId: info.campaignId }))
      .setLabel("Map")
      .setEmoji("🗺️")
      .setStyle(ButtonStyle.Secondary),
  );
  if (info.status === "setup") {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(encodeId({ kind: "start", campaignId: info.campaignId }))
        .setLabel("Begin the adventure")
        .setEmoji("🏮")
        .setStyle(ButtonStyle.Success),
    );
  }
  c.addActionRowComponents(row);
  return { components: [c], flags: V2, allowedMentions: { parse: [] as never[] } };
}
