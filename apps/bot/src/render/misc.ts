import { SRD_ATTRIBUTION } from "@dq/core/srd";
import { ContainerBuilder } from "discord.js";
import { COLORS, divider, esc, text, V2_EPHEMERAL } from "./common";

export function renderAbout() {
  const c = new ContainerBuilder().setAccentColor(COLORS.lantern);
  c.addTextDisplayComponents(
    text(
      "## Discord Quests\nTabletop adventures for families and friends, told by an AI storyteller or run by a human DM with the bot's help. Two roads, one world, and choices that matter more than you might think.",
    ),
  );
  c.addSeparatorComponents(divider());
  c.addTextDisplayComponents(text(`-# ${SRD_ATTRIBUTION}`));
  return { components: [c], flags: V2_EPHEMERAL };
}

export function renderPrivacy() {
  const c = new ContainerBuilder().setAccentColor(COLORS.calm);
  c.addTextDisplayComponents(
    text(
      [
        "## What this bot remembers",
        "- Your Discord user id, so your hero stays yours.",
        "- Your hero (name, class, stats, gear) and the story your table plays.",
        "- When safety filters block a message: that it happened and why, but **never the text itself**.",
        "",
        "It never asks for real names, ages, schools or where anyone lives, and the story is told to steer away if someone shares them.",
        "",
        "The campaign host or DM can delete a campaign and everything in it with `/campaign delete`.",
        "",
        "-# Discord requires users to be 13 or older. Younger players should play with a parent or guardian.",
      ].join("\n"),
    ),
  );
  return { components: [c], flags: V2_EPHEMERAL };
}

export function renderHelp() {
  const c = new ContainerBuilder().setAccentColor(COLORS.lantern);
  c.addTextDisplayComponents(
    text(
      [
        "## How to play",
        "1. `/campaign new` starts a campaign and opens a thread for it.",
        "2. Everyone presses **Make my hero** (or uses `/character create`). Pick **Guided** if you're new: you choose stories, and the numbers follow.",
        "3. The host presses **Begin the adventure**.",
        "4. Each turn, pick a choice, or press **Something else…** and say what your hero does. When everyone has chosen, the story continues.",
        "",
        "**Handy commands:** `/character sheet`, `/map`, `/journal`, `/roll 1d20+3`, `/character levelup`",
        "**Not this:** press it any time to quietly steer the story away from something. No one sees who pressed it.",
        "",
        "**Running it yourself?** Start `/campaign new` and pick **A person runs it** as the storyteller. Each turn arrives in your private DM screen to send, edit, redo or rewrite. `/dm say` posts your own words; `/loom view` shows what the hidden hand is holding.",
      ].join("\n"),
    ),
  );
  return { components: [c], flags: V2_EPHEMERAL };
}

export function renderJournal(j: {
  quests: Array<{ title: string; objective: string; status: string }>;
  promises: Array<{ to: string; text: string; status: string }>;
  recent: string[];
}) {
  const c = new ContainerBuilder().setAccentColor(COLORS.forest);
  c.addTextDisplayComponents(
    text(
      `## Journal\n**Quests**\n${
        j.quests.length
          ? j.quests
              .map(
                (q) =>
                  `- ${q.status === "completed" ? "✅" : q.status === "failed" ? "✖️" : "🔸"} **${q.title}**: ${q.objective}`,
              )
              .join("\n")
          : "- None yet."
      }`,
    ),
  );
  c.addTextDisplayComponents(
    text(
      `**Promises**\n${
        j.promises.length
          ? j.promises
              .map(
                (p) =>
                  `- ${p.status === "kept" ? "🤝" : p.status === "broken" ? "💔" : "⏳"} To ${esc(p.to)}: ${esc(p.text)}`,
              )
              .join("\n")
          : "- None yet."
      }`,
    ),
  );
  if (j.recent.length > 0) {
    c.addSeparatorComponents(divider());
    c.addTextDisplayComponents(
      text(`**Lately…**\n${j.recent.map((r) => `> ${r.slice(0, 600)}`).join("\n\n")}`),
    );
  }
  return { components: [c], flags: V2_EPHEMERAL };
}
