import { guilds as guildsTable } from "@dq/db";
import { inArray } from "drizzle-orm";
import Link from "next/link";
import { manageableGuilds } from "@/server/access";
import { services } from "@/server/db";
import { guildIconUrl, inviteUrl } from "@/server/discord";
import { webEnv } from "@/server/env";

export const metadata = { title: "Your servers" };
export const dynamic = "force-dynamic";

export default async function Servers() {
  const list = await manageableGuilds();
  const ids = list.map((g) => g.id);
  const present =
    ids.length > 0
      ? await services()
          .handle.db.select({ id: guildsTable.id, botPresent: guildsTable.botPresent })
          .from(guildsTable)
          .where(inArray(guildsTable.id, ids))
      : [];
  const here = new Set(present.filter((p) => p.botPresent).map((p) => p.id));
  const sorted = [...list].sort(
    (a, b) => Number(here.has(b.id)) - Number(here.has(a.id)) || a.name.localeCompare(b.name),
  );
  const clientId = webEnv().DISCORD_CLIENT_ID;

  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <h1>Your servers</h1>
          <p className="muted">Servers where you can manage the server. Pick one to set up.</p>
        </div>
      </div>
      {sorted.length === 0 ? (
        <div className="callout">
          You don't manage any servers yet. You need the <strong>Manage Server</strong> permission on a
          Discord server to set the bot up there.
        </div>
      ) : (
        <div className="grid">
          {sorted.map((g) => {
            const icon = guildIconUrl(g);
            const installed = here.has(g.id);
            return (
              <div key={g.id} className="card server-card">
                <div className="server-icon" aria-hidden>
                  {icon ? <img src={icon} alt="" /> : g.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="grow">
                  <h3>{g.name}</h3>
                  {installed ? (
                    <span className="badge badge-ok">Bot is here</span>
                  ) : (
                    <span className="badge">Bot not added yet</span>
                  )}
                </div>
                {installed ? (
                  <Link className="btn btn-primary btn-sm" href={`/servers/${g.id}`}>
                    Set up
                  </Link>
                ) : (
                  <div className="row" style={{ gap: 6 }}>
                    <a className="btn btn-sm" href={inviteUrl(clientId, g.id)}>
                      Add bot
                    </a>
                    <Link className="btn btn-ghost btn-sm" href={`/servers/${g.id}`}>
                      Set up
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
