import { GUIDE, type GuideSection } from "@dq/engine";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder } from "discord.js";
import { COLORS, clip, divider, text, V2, V2_EPHEMERAL } from "./common";

export function guideUrl(base: string | undefined, anchor?: string): string | null {
  return base ? `${base.replace(/\/$/, "")}/guide${anchor ? `#${anchor}` : ""}` : null;
}

function sectionText(s: GuideSection): string {
  return [
    `### ${s.title}`,
    ...(s.intro ? [s.intro] : []),
    ...(s.steps ?? []).map((st) => `- ${st}`),
    ...(s.notes ?? []).map((n) => `-# ${n}`),
  ].join("\n");
}

/** The getting-started guide, in Discord. */
export function renderGuide(ids: string[], base: string | undefined, ephemeral = true) {
  const c = new ContainerBuilder().setAccentColor(COLORS.lantern);
  c.addTextDisplayComponents(text("## Setting up Discord Quests"));
  let left = 3500;
  for (const s of GUIDE.filter((x) => ids.includes(x.id))) {
    // Once the room is used up, stop: the full guide is a button away.
    if (left < 40) break;
    const body = clip(sectionText(s), left);
    left -= body.length;
    c.addTextDisplayComponents(text(body));
  }
  const url = guideUrl(base);
  if (url) {
    c.addSeparatorComponents(divider());
    c.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setURL(url)
          .setLabel("Open the full guide")
          .setEmoji("📖"),
      ),
    );
  }
  return { components: [c], flags: ephemeral ? V2_EPHEMERAL : V2, allowedMentions: { parse: [] as never[] } };
}

/** Posted once when the bot joins a server: what to do next. */
export function renderWelcome(base: string | undefined) {
  const url = guideUrl(base);
  const c = new ContainerBuilder().setAccentColor(COLORS.lantern);
  c.addTextDisplayComponents(
    text(
      [
        "## 🏮 Thanks for inviting Discord Quests!",
        "Before the first adventure, the bot needs **two rooms**:",
        "- **A table room** where everyone plays, like `#quest-table`.",
        "- **A private DM room** for the storytellers and the bot, like `#dm-screen` (turn on *Private Channel* and add your DMs and the bot).",
        "Then someone with **Manage Server** runs `/setup table:#quest-table dm-room:#dm-screen`. After that, anyone can start with `/campaign new`.",
        url
          ? "The guide walks through it step by step:"
          : "Run `/help topic:setup` for the step-by-step guide.",
      ].join("\n"),
    ),
  );
  if (url) {
    c.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setURL(url)
          .setLabel("How to set up the bot")
          .setEmoji("📖"),
        ...(base
          ? [
              new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setURL(`${base.replace(/\/$/, "")}/servers`)
                .setLabel("Choose the storyteller AI")
                .setEmoji("⚙️"),
            ]
          : []),
      ),
    );
  }
  return { components: [c], flags: V2, allowedMentions: { parse: [] as never[] } };
}
