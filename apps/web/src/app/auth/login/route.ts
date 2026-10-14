import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authorizeUrl } from "@/server/discord";
import { secureCookies, webEnv } from "@/server/env";
import { newToken, STATE_COOKIE } from "@/server/session";

export const dynamic = "force-dynamic";

/** Starts "Sign in with Discord". The state cookie ties the callback to this browser. */
export async function GET() {
  const env = webEnv();
  const state = newToken();
  (await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: secureCookies(env),
    sameSite: "lax",
    path: "/auth",
    maxAge: 600,
  });
  return NextResponse.redirect(
    authorizeUrl({
      clientId: env.DISCORD_CLIENT_ID,
      redirectUri: `${env.WEB_BASE_URL}/auth/callback`,
      state,
    }),
  );
}
