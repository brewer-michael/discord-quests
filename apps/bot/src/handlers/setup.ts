import {
  type ChatInputCommandInteraction,
  ContainerBuilder,
  type Guild,
  PermissionFlagsBits,
  type TextChannel,
} from "discord.js";
import type { BotContext } from "../context";
import { COLORS, text, V2_EPHEMERAL } from "../render/common";
import { guideUrl } from "../render/guide";
import { checkRoom, fetchRoom, isTextRoom, type RoomKind, whoCanSee } from "../rooms";
import { say } from "./shared";

const NAMES: Record<RoomKind, string> = { table: "Table room", dm: "DM room" };

function roomLine(kind: RoomKind, room: TextChannel | null, configured: boolean, problems: string[]): string {
  if (!configured) return `❌ **${NAMES[kind]}:** not chosen yet`;
  if (!room) return `⚠️ **${NAMES[kind]}:** I can't find it any more. Choose it again.`;
  if (problems.length > 0)
    return `⚠️ **${NAMES[kind]}:** ${room.toString()}\n${problems.map((p) => `  - ${p}`).join("\n")}`;
  const seen = kind === "dm" ? whoCanSee(room) : [];
  return `✅ **${NAMES[kind]}:** ${room.toString()}${seen.length > 0 ? ` (open to ${seen.join(", ")})` : ""}`;
}

/** /setup: choose the two rooms (with checks), or see how things stand. */
export async function setupCommand(ctx: BotContext, i: ChatInputCommandInteraction) {
  const guild = i.guild;
  if (!guild) return say(i, "Use `/setup` in a server.");
  if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild))
    return say(i, "Only people with the **Manage Server** permission can set the bot up.");
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const table = i.options.getChannel("table");
  const dm = i.options.getChannel("dm-room");
  const help = guideUrl(ctx.env.WEB_BASE_URL, "rooms");
  const fixLater = help ? `\nThe guide shows how: ${help}` : "\nRun `/help topic:setup` for the steps.";

  if (table && dm && table.id === dm.id)
    return say(
      i,
      "The DM room has to be a different room from the table room, so players don't see the DM's screen.",
    );
  const chosen: Array<[RoomKind, TextChannel]> = [];
  for (const [kind, ch] of [
    ["table", table],
    ["dm", dm],
  ] as const) {
    if (!ch) continue;
    const room = await fetchRoom(guild, ch.id);
    if (!isTextRoom(room)) return say(i, `${NAMES[kind]} has to be a regular text channel.`);
    const problems = checkRoom(kind, room, me);
    if (problems.length > 0)
      return say(
        i,
        `I can't use ${room.toString()} as the ${NAMES[kind].toLowerCase()} yet:\n${problems.map((p) => `- ${p}`).join("\n")}${fixLater}`,
      );
    chosen.push([kind, room]);
  }
  if (chosen.length > 0)
    await ctx.engine.campaigns.setRooms(
      { id: guild.id, name: guild.name },
      Object.fromEntries(chosen.map(([k, r]) => [k, { id: r.id, name: r.name }])),
    );
  await i.reply((await setupStatus(ctx, guild, chosen.length > 0)) as never);
}

export async function setupStatus(ctx: BotContext, guild: Guild, justSaved: boolean) {
  const rooms = await ctx.engine.campaigns.rooms(guild.id);
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const table = await fetchRoom(guild, rooms.table?.id);
  const dm = await fetchRoom(guild, rooms.dm?.id);
  const tableProblems = table ? checkRoom("table", table, me) : [];
  const dmProblems = dm ? checkRoom("dm", dm, me) : [];
  const ready = table && dm && tableProblems.length === 0 && dmProblems.length === 0;
  const base = ctx.env.WEB_BASE_URL;
  const ai = [
    ctx.env.OPENAI_API_KEY ? "OpenAI" : null,
    ctx.env.GEMINI_API_KEY ? "Gemini" : null,
    ctx.env.ANTHROPIC_API_KEY ? "Anthropic" : null,
  ].filter(Boolean);
  const lines = [
    `## ${justSaved ? "Saved! " : ""}Discord Quests on ${guild.name}`,
    roomLine("table", table, Boolean(rooms.table), tableProblems),
    roomLine("dm", dm, Boolean(rooms.dm), dmProblems),
    "",
    ready
      ? "Everything's ready. Start an adventure with `/campaign new`."
      : `Choose the rooms with \`/setup table:#room dm-room:#private-room\`.${guideUrl(base, "rooms") ? ` The guide shows how: ${guideUrl(base, "rooms")}` : " Run `/help topic:setup` for the steps."}`,
    "",
    base
      ? `**Storyteller AI, budgets and art:** ${base.replace(/\/$/, "")}/servers/${guild.id}`
      : "The setup site isn't configured on this bot (WEB_BASE_URL).",
    ai.length > 0
      ? `-# Until you choose your own, this bot's built-in ${ai.join(", ")} is used, with a shared daily limit.`
      : "-# Without a storyteller AI, the bot still runs the game and tells a simpler story on its own.",
  ];
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(ready ? COLORS.forest : COLORS.lantern)
        .addTextDisplayComponents(text(lines.join("\n"))),
    ],
    flags: V2_EPHEMERAL,
    allowedMentions: { parse: [] as never[] },
  };
}
