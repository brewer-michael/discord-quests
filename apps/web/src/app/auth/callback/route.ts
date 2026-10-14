import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { services } from "@/server/db";
import { exchangeCode, fetchGuilds, fetchUser } from "@/server/discord";
import { secureCookies, webEnv } from "@/server/env";
import { createSession, SESSION_COOKIE, STATE_COOKIE } from "@/server/session";

export const dynamic = "force-dynamic";

function sameState(a: string | undefined, b: string | null): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function GET(req: NextRequest) {
  const env = webEnv();
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  jar.delete({ name: STATE_COOKIE, path: "/auth" });
  const params = req.nextUrl.searchParams;
  const home = (error: string) => NextResponse.redirect(new URL(`/?error=${error}`, env.WEB_BASE_URL));

  if (params.get("error")) return home("denied");
  const code = params.get("code");
  if (!code || !sameState(expected, params.get("state"))) return home("signin");

  try {
    const token = await exchangeCode({
      apiBase: env.DISCORD_API_BASE,
      clientId: env.DISCORD_CLIENT_ID,
      clientSecret: env.DISCORD_CLIENT_SECRET,
      code,
      redirectUri: `${env.WEB_BASE_URL}/auth/callback`,
    });
    const [user, guilds] = await Promise.all([
      fetchUser(env.DISCORD_API_BASE, token.access_token),
      fetchGuilds(env.DISCORD_API_BASE, token.access_token),
    ]);
    const { handle, keys } = services();
    const session = await createSession(handle.db, keys, {
      user,
      accessToken: token.access_token,
      expiresInSeconds: token.expires_in,
      guilds,
    });
    jar.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: secureCookies(env),
      sameSite: "lax",
      path: "/",
      expires: session.expiresAt,
    });
    return NextResponse.redirect(new URL("/servers", env.WEB_BASE_URL));
  } catch (e) {
    console.error("sign-in failed", (e as Error).message);
    return home("signin");
  }
}
