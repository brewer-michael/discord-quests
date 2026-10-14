/**
 * Registers slash commands with Discord. With DISCORD_DEV_GUILD_ID set they
 * appear instantly in that one server; otherwise globally (can take a while).
 */
import { REST, Routes } from "discord.js";
import { commandsJson } from "./commands";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
if (!token || !clientId) {
  console.error("DISCORD_TOKEN and DISCORD_CLIENT_ID are required");
  process.exit(1);
}
const rest = new REST().setToken(token);
const guildId = process.env.DISCORD_DEV_GUILD_ID;
const route = guildId
  ? Routes.applicationGuildCommands(clientId, guildId)
  : Routes.applicationCommands(clientId);
await rest.put(route, { body: commandsJson() });
console.log(`Registered ${commandsJson().length} commands ${guildId ? `in guild ${guildId}` : "globally"}.`);
