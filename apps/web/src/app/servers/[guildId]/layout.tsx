import { guilds } from "@dq/db";
import { eq } from "drizzle-orm";
import type { ReactNode } from "react";
import { ServerNav } from "@/components/ServerNav";
import { requireGuild } from "@/server/access";
import { services } from "@/server/db";
import { guildIconUrl, inviteUrl } from "@/server/discord";
import { webEnv } from "@/server/env";

export default async function ServerLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const { guild } = await requireGuild(guildId);
  const [row] = await services()
    .handle.db.select({ botPresent: guilds.botPresent })
    .from(guilds)
    .where(eq(guilds.id, guildId));
  const icon = guildIconUrl(guild);
  return (
    <>
      <div className="server-head">
        <div className="server-icon" aria-hidden>
          {icon ? <img src={icon} alt="" /> : guild.name.slice(0, 1).toUpperCase()}
        </div>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, overflowWrap: "anywhere" }}>{guild.name}</h1>
          {row?.botPresent ? (
            <span className="badge badge-ok">Bot is here</span>
          ) : (
            <span className="badge badge-warn">
              Bot not added yet ·{" "}
              <a href={inviteUrl(webEnv().DISCORD_CLIENT_ID, guildId)} style={{ color: "inherit" }}>
                add it
              </a>
            </span>
          )}
        </div>
      </div>
      <div className="server-layout">
        <ServerNav guildId={guildId} />
        <div className="stack">{children}</div>
      </div>
    </>
  );
}
