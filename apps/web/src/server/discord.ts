import type { SessionGuild } from "@dq/db";
import { z } from "zod";

/** The permissions the bot asks for when it's added to a server (see docs/RUNNING.md). */
export const BOT_PERMISSIONS = "2252194950794240";
const ADMINISTRATOR = 0x8n;
const MANAGE_GUILD = 0x20n;

export function authorizeUrl(opts: { clientId: string; redirectUri: string; state: string }): string {
  const u = new URL("https://discord.com/oauth2/authorize");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", opts.clientId);
  u.searchParams.set("scope", "identify guilds");
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("state", opts.state);
  u.searchParams.set("prompt", "none");
  return u.toString();
}

/** "Add to server", optionally pre-selecting one server. */
export function inviteUrl(clientId: string, guildId?: string): string {
  const u = new URL("https://discord.com/oauth2/authorize");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("scope", "bot applications.commands");
  u.searchParams.set("permissions", BOT_PERMISSIONS);
  if (guildId) {
    u.searchParams.set("guild_id", guildId);
    u.searchParams.set("disable_guild_select", "true");
  }
  return u.toString();
}

/** Server owners, administrators and anyone with Manage Server can set the bot up. */
export function canManage(g: Pick<SessionGuild, "owner" | "permissions">): boolean {
  if (g.owner) return true;
  try {
    const bits = BigInt(g.permissions);
    return (bits & (ADMINISTRATOR | MANAGE_GUILD)) !== 0n;
  } catch {
    return false;
  }
}

const Token = z.object({ access_token: z.string(), token_type: z.string(), expires_in: z.number() });
const User = z.object({
  id: z.string(),
  username: z.string(),
  global_name: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
});
const Guilds = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    icon: z.string().nullable().optional(),
    owner: z.boolean().optional(),
    permissions: z.string().optional(),
  }),
);

export class DiscordError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(
  schema: z.ZodType<T>,
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<T> {
  const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new DiscordError(`Discord answered ${res.status}`, res.status);
  return schema.parse(await res.json());
}

export function exchangeCode(
  opts: { apiBase: string; clientId: string; clientSecret: string; code: string; redirectUri: string },
  fetchImpl: typeof fetch = fetch,
) {
  return call(
    Token,
    `${opts.apiBase}/oauth2/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: opts.code,
        redirect_uri: opts.redirectUri,
        client_id: opts.clientId,
        client_secret: opts.clientSecret,
      }),
    },
    fetchImpl,
  );
}

export async function fetchUser(apiBase: string, token: string, fetchImpl: typeof fetch = fetch) {
  const u = await call(
    User,
    `${apiBase}/users/@me`,
    { headers: { authorization: `Bearer ${token}` } },
    fetchImpl,
  );
  return { id: u.id, username: u.global_name || u.username, avatar: u.avatar ?? null };
}

export async function fetchGuilds(
  apiBase: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SessionGuild[]> {
  const list = await call(
    Guilds,
    `${apiBase}/users/@me/guilds`,
    { headers: { authorization: `Bearer ${token}` } },
    fetchImpl,
  );
  return list.map((g) => ({
    id: g.id,
    name: g.name,
    icon: g.icon ?? null,
    owner: g.owner ?? false,
    permissions: g.permissions ?? "0",
  }));
}

export function guildIconUrl(g: Pick<SessionGuild, "id" | "icon">): string | null {
  return g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64` : null;
}

export function avatarUrl(userId: string, avatar: string | null): string | null {
  return avatar ? `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png?size=64` : null;
}
