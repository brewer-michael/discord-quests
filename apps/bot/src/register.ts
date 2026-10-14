/**
 * Slash command registration. The bot does this at startup (so upgrades
 * never leave stale commands behind), and `pnpm --filter @dq/bot register`
 * does it by hand. With a dev guild id the commands appear instantly in that
 * one server; otherwise globally (can take a while the first time).
 */
import { REST, Routes } from "discord.js";
import { commandsJson } from "./commands";

export function commandRoute(clientId: string, guildId?: string): `/${string}` {
  return guildId ? Routes.applicationGuildCommands(clientId, guildId) : Routes.applicationCommands(clientId);
}

/** Replaces the whole command set in one call; unchanged commands are left as they are. */
export async function registerCommands(args: {
  token: string;
  clientId: string;
  guildId?: string;
}): Promise<{ count: number; scope: string }> {
  const body = commandsJson();
  await new REST().setToken(args.token).put(commandRoute(args.clientId, args.guildId), { body });
  return { count: body.length, scope: args.guildId ? `in guild ${args.guildId}` : "globally" };
}
