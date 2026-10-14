import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { requireGuild } from "@/server/access";
import { listCampaigns } from "@/server/campaigns";
import { services } from "@/server/db";
import { campaignStatusAction, deleteCampaignAction } from "../actions";

export const metadata = { title: "Campaigns" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; cls: string }> = {
  setup: { label: "Getting ready", cls: "badge" },
  active: { label: "Playing", cls: "badge badge-ok" },
  paused: { label: "Paused", cls: "badge badge-warn" },
  ended: { label: "Ended", cls: "badge" },
};

export default async function Campaigns({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  await requireGuild(guildId);
  const list = await listCampaigns(services().handle.db, guildId);
  return (
    <>
      <div>
        <h2>Campaigns</h2>
        <p className="muted">
          Start new ones in Discord with <code>/campaign new</code>.
        </p>
      </div>
      {list.length === 0 ? (
        <div className="callout">No campaigns on this server yet.</div>
      ) : (
        list.map((c) => {
          const st = STATUS[c.status] ?? { label: c.status, cls: "badge" };
          return (
            <section key={c.id} className="card" aria-labelledby={`c-${c.id}`}>
              <div className="card-head">
                <div style={{ minWidth: 0 }}>
                  <h3 id={`c-${c.id}`} style={{ overflowWrap: "anywhere" }}>
                    {c.name}
                  </h3>
                  <span className="muted small">
                    {c.mode === "assist" ? "A person runs it" : "The bot tells the story"} · {c.players}{" "}
                    {c.players === 1 ? "player" : "players"} · {c.turns} turns · started{" "}
                    {c.createdAt.toISOString().slice(0, 10)}
                  </span>
                </div>
                <span className={st.cls}>{st.label}</span>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                {c.status === "active" ? (
                  <ActionForm action={campaignStatusAction.bind(null, guildId, c.id, "paused")} className="">
                    <SubmitButton className="btn btn-sm" pendingText="Pausing…">
                      Pause
                    </SubmitButton>
                  </ActionForm>
                ) : null}
                {c.status === "paused" ? (
                  <ActionForm action={campaignStatusAction.bind(null, guildId, c.id, "active")} className="">
                    <SubmitButton className="btn btn-sm" pendingText="Resuming…">
                      Resume
                    </SubmitButton>
                  </ActionForm>
                ) : null}
                {c.status === "active" || c.status === "paused" ? (
                  <ActionForm
                    action={campaignStatusAction.bind(null, guildId, c.id, "ended")}
                    className=""
                    confirm={`End “${c.name}”? The story stops here, but its history is kept.`}
                  >
                    <SubmitButton className="btn btn-sm" pendingText="Ending…">
                      End
                    </SubmitButton>
                  </ActionForm>
                ) : null}
                <a className="btn btn-sm" href={`/servers/${guildId}/campaigns/${c.id}/export`} download>
                  Download story
                </a>
                <Link className="btn btn-sm btn-ghost" href={`/servers/${guildId}/campaigns/${c.id}/loom`}>
                  Peek at the hidden hand
                </Link>
              </div>
              <details style={{ marginTop: 12 }}>
                <summary className="small">Delete forever</summary>
                <ActionForm action={deleteCampaignAction.bind(null, guildId, c.id)}>
                  <div className="field">
                    <label htmlFor={`del-${c.id}`}>
                      Type <strong>{c.name}</strong> to permanently delete this campaign and its whole history
                    </label>
                    <input id={`del-${c.id}`} name="confirmName" type="text" autoComplete="off" required />
                  </div>
                  <div>
                    <SubmitButton className="btn btn-danger" pendingText="Deleting…">
                      Delete forever
                    </SubmitButton>
                  </div>
                </ActionForm>
              </details>
            </section>
          );
        })
      )}
    </>
  );
}
