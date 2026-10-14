/**
 * The two rooms a server gives the bot: a table room where everyone plays,
 * and a private DM room for the storytellers' screens.
 */
import {
  ChannelType,
  type Guild,
  type GuildBasedChannel,
  type GuildMember,
  OverwriteType,
  PermissionFlagsBits,
  type TextChannel,
} from "discord.js";

export type RoomKind = "table" | "dm";
type Perm = keyof typeof PermissionFlagsBits;

const NEEDS: Record<RoomKind, Array<[Perm, string]>> = {
  table: [
    ["ViewChannel", "see the room"],
    ["SendMessages", "post in it"],
    ["SendMessagesInThreads", "post in its threads"],
    ["CreatePublicThreads", "start a thread for each campaign"],
    ["EmbedLinks", "show story cards"],
    ["AttachFiles", "attach maps and scene art"],
    ["ReadMessageHistory", "read back its own turns"],
    ["PinMessages", "pin each campaign's welcome card"],
  ],
  dm: [
    ["ViewChannel", "see the room"],
    ["SendMessages", "post in it"],
    ["SendMessagesInThreads", "post in its threads"],
    ["CreatePrivateThreads", "make a private screen for each DM"],
    ["EmbedLinks", "show story cards"],
    ["ReadMessageHistory", "read back its own drafts"],
  ],
};

/** What's wrong with a room, in plain words. Empty means it's ready. */
export function roomProblems(
  kind: RoomKind,
  botHas: (perm: Perm) => boolean,
  everyoneCanSee: boolean,
): string[] {
  const problems = NEEDS[kind]
    .filter(([perm]) => !botHas(perm))
    .map(([, what]) => `I need permission to ${what}.`);
  if (kind === "dm" && everyoneCanSee)
    problems.push(
      "Everyone on the server can see this room. Make it private first (only your DMs and the bot), so the story's secrets stay secret.",
    );
  return problems;
}

export function isTextRoom(channel: GuildBasedChannel | null | undefined): channel is TextChannel {
  return channel?.type === ChannelType.GuildText;
}

export function checkRoom(kind: RoomKind, channel: TextChannel, me: GuildMember): string[] {
  const mine = channel.permissionsFor(me);
  const everyone = channel.permissionsFor(channel.guild.roles.everyone);
  return roomProblems(
    kind,
    (p) => mine.has(PermissionFlagsBits[p]),
    everyone.has(PermissionFlagsBits.ViewChannel),
  );
}

/** The roles and people a private room is opened to (from its permission settings). */
export function whoCanSee(channel: TextChannel): string[] {
  return [...channel.permissionOverwrites.cache.values()]
    .filter((o) => o.allow.has(PermissionFlagsBits.ViewChannel) && o.id !== channel.guild.id)
    .map((o) => (o.type === OverwriteType.Role ? `<@&${o.id}>` : `<@${o.id}>`));
}

/** Can this person open the DM room? Their private screen lives inside it. */
export async function canSeeRoom(guild: Guild, channel: TextChannel, userId: string): Promise<boolean> {
  const member = await guild.members.fetch(userId).catch(() => null);
  return Boolean(member && channel.permissionsFor(member).has(PermissionFlagsBits.ViewChannel));
}

export async function fetchRoom(guild: Guild, id: string | undefined): Promise<TextChannel | null> {
  if (!id) return null;
  const ch = await guild.channels.fetch(id).catch(() => null);
  return isTextRoom(ch) ? ch : null;
}
