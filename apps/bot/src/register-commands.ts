/**
 * Registers slash commands with Discord by hand. The bot also does this every
 * time it starts (unless REGISTER_COMMANDS=false).
 */
import { registerCommands } from "./register";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
if (!token || !clientId) {
  console.error("DISCORD_TOKEN and DISCORD_CLIENT_ID are required");
  process.exit(1);
}
const { count, scope } = await registerCommands({
  token,
  clientId,
  guildId: process.env.DISCORD_DEV_GUILD_ID || undefined,
});
console.log(`Registered ${count} commands ${scope}.`);
