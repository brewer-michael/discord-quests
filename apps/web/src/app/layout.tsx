import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { currentSession } from "@/server/access";
import { avatarUrl } from "@/server/discord";
import { signOut } from "./actions";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Discord Quests", template: "%s · Discord Quests" },
  description: "Set up Discord Quests for your server: story and image AI, budgets and campaigns.",
  robots: { index: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fffdf8" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1d28" },
  ],
};

async function UserMenu() {
  const s = await currentSession().catch(() => null);
  if (!s) {
    return (
      <a className="btn btn-sm" href="/auth/login">
        Sign in with Discord
      </a>
    );
  }
  const avatar = avatarUrl(s.userId, s.avatar);
  return (
    <div className="user">
      {avatar ? <img className="avatar" src={avatar} alt="" /> : <span className="avatar" aria-hidden />}
      <span className="user-name small">{s.username}</span>
      <form action={signOut}>
        <button type="submit" className="btn btn-ghost btn-sm">
          Sign out
        </button>
      </form>
    </div>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/" className="brand">
              <span className="brand-mark" aria-hidden>
                🏮
              </span>
              Discord Quests
            </Link>
            <span className="spacer" />
            <UserMenu />
          </div>
        </header>
        <main className="page">{children}</main>
        <footer className="footer">
          Discord Quests is not affiliated with Discord. Game rules are adapted from the System Reference
          Document 5.2.1 (CC-BY-4.0). <Link href="/guide">Setup guide</Link> ·{" "}
          <Link href="/privacy">Privacy</Link>
        </footer>
      </body>
    </html>
  );
}
