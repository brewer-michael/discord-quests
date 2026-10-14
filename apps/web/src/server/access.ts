import type { SessionGuild } from "@dq/db";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { services } from "./db";
import { canManage, DiscordError, fetchGuilds } from "./discord";
import { webEnv } from "./env";
import {
  findSession,
  GUILDS_FRESH_MS,
  SESSION_COOKIE,
  type Session,
  sessionAccessToken,
  updateSessionGuilds,
} from "./session";

/** A stale server list is never trusted for longer than this, even if Discord can't be reached. */
const GUILDS_MAX_STALE_MS = 60 * 60 * 1000;

export const currentSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return findSession(services().handle.db, token);
});

export async function requireSession(): Promise<Session> {
  const s = await currentSession();
  if (!s) redirect("/auth/login");
  return s;
}

/** The servers this person may set up, refreshed from Discord every few minutes. */
export const manageableGuilds = cache(async (): Promise<SessionGuild[]> => {
  const s = await requireSession();
  const age = Date.now() - s.guildsFetchedAt.getTime();
  let list = s.guilds;
  if (age > GUILDS_FRESH_MS) {
    try {
      const { handle, keys } = services();
      list = await fetchGuilds(webEnv().DISCORD_API_BASE, sessionAccessToken(s, keys));
      await updateSessionGuilds(handle.db, s.id, list);
    } catch (e) {
      if ((e instanceof DiscordError && e.status === 401) || age > GUILDS_MAX_STALE_MS)
        redirect("/auth/login");
    }
  }
  return list.filter(canManage);
});

export interface GuildAccess {
  userId: string;
  guild: SessionGuild;
}

/** Every page and action for a server goes through here: signed in, and allowed to manage it. */
export async function requireGuild(guildId: string): Promise<GuildAccess> {
  const s = await requireSession();
  const guild = (await manageableGuilds()).find((g) => g.id === guildId);
  if (!guild) notFound();
  return { userId: s.userId, guild };
}
