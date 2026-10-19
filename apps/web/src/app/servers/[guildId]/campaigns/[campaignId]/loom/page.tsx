import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { requireGuild } from "@/server/access";
import { getCampaign, loomForWeb } from "@/server/campaigns";
import { services } from "@/server/db";
import { grantSpoilerAction } from "../../../actions";

export const metadata = { title: "The hidden hand" };
export const dynamic = "force-dynamic";

const STATE_ICON: Record<string, string> = { seedling: "🌑", budding: "🌗", ripe: "🌕", woven: "✨" };
const words = (s: string) => s.replaceAll("_", " ");
const WRITER_ICON: Record<string, string> = {
  queued: "⏳",
  running: "🖋️",
  done: "✅",
  failed: "⚠️",
  stale: "↩️",
};
const WRITER_STATUS: Record<string, string> = {
  queued: "waiting",
  running: "writing",
  done: "ready",
  failed: "gave up",
  stale: "undone by a rewind",
};

export default async function Loom({ params }: { params: Promise<{ guildId: string; campaignId: string }> }) {
  const { guildId, campaignId } = await params;
  const { userId } = await requireGuild(guildId);
  const db = services().handle.db;
  const campaign = await getCampaign(db, guildId, campaignId);
  if (!campaign) notFound();
  const view = await loomForWeb(db, guildId, userId, campaignId);
  const back = (
    <p className="small">
      <Link href={`/servers/${guildId}/campaigns`}>← Campaigns</Link>
    </p>
  );

  if (!view) {
    return (
      <div className="card stack" style={{ maxWidth: 640 }}>
        {back}
        <h2>Spoilers ahead</h2>
        <p>
          This shows what the hidden hand is holding in <strong>{campaign.name}</strong>: which good deeds are
          waiting to matter, which shortcuts will come back around, and who is being kept safe for later.
        </p>
        <p className="muted">
          If you're playing in this campaign, it will spoil the surprise. Looking is recorded in this server's
          activity log.
        </p>
        <ActionForm action={grantSpoilerAction.bind(null, guildId, campaignId)}>
          <div>
            <SubmitButton pendingText="Opening…">Show me anyway</SubmitButton>
          </div>
        </ActionForm>
      </div>
    );
  }

  const { loom, writer, material } = view;
  const chapterNow = material
    ? Object.keys(material.chapters)
        .map(Number)
        .sort((a, b) => b - a)[0]
    : undefined;
  const detail = chapterNow !== undefined ? material?.chapters[String(chapterNow)] : undefined;
  return (
    <>
      <div className="card">
        {back}
        <h2>The hidden hand in {campaign.name}</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Shown in words, not numbers, on purpose. This view closes after 15 minutes.
        </p>
      </div>
      <div className="card">
        <h3>Threads</h3>
        <p className="hint">Kindness, mercy and patience waiting to matter.</p>
        {loom.threads.length === 0 ? (
          <p className="muted">None yet.</p>
        ) : (
          <ul className="thread-list">
            {loom.threads.map((t) => (
              <li key={t.id}>
                <span aria-hidden>{STATE_ICON[t.state] ?? "•"}</span>
                <span>
                  {t.deed}
                  {t.anchor ? <span className="muted"> · {t.anchor}</span> : null}{" "}
                  <span className="badge">{t.state}</span>{" "}
                  {t.reservedForFinale ? (
                    <span className="badge badge-accent">kept for the finale</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="card">
        <h3>Snares</h3>
        <p className="hint">Shortcuts that will come back around.</p>
        {loom.snares.length === 0 ? (
          <p className="muted">None.</p>
        ) : (
          <ul className="thread-list">
            {loom.snares.map((s) => (
              <li key={s.id}>
                <span aria-hidden>{s.state === "unknotted" ? "🪢" : s.state === "sprung" ? "💥" : "⏳"}</span>
                <span>
                  {s.deed} <span className="muted">· {s.hint}</span>{" "}
                  <span className="badge">{words(s.state)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="grid">
        <div className="card">
          <h3>Kept safe</h3>
          <p className="hint">Characters the story protects because a thread runs through them.</p>
          {loom.bearers.length === 0 ? (
            <p className="muted">Nobody yet.</p>
          ) : (
            <ul className="thread-list">
              {loom.bearers.map((b) => (
                <li key={b.name}>
                  <span aria-hidden>🛡️</span>
                  <span>
                    {b.name} <span className="muted">· {words(b.presence)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card">
          <h3>Quiet detours</h3>
          <p className="hint">Small changes of path, each with a purpose later on.</p>
          {loom.detours.length === 0 ? (
            <p className="muted">None.</p>
          ) : (
            <ul className="thread-list">
              {loom.detours.map((d) => (
                <li key={d.id}>
                  <span aria-hidden>🧭</span>
                  <span>
                    {words(d.template)} <span className="muted">→ {words(d.target)}</span>{" "}
                    <span className="badge">{words(d.state)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="card">
        <h3>Story writer</h3>
        <p className="hint">
          The story written ahead of the table, in the background: the outline, the story bible, the plot
          spine, each chapter in detail and side quests. Its jobs are below the material.
        </p>
        {!material ? (
          <p className="muted">No material yet: the story is written when the campaign is created.</p>
        ) : (
          <div className="stack">
            {material.outline ? (
              <div>
                <h4>Outline</h4>
                <p>
                  {material.outline.pitch} <span className="muted">({material.outline.shape})</span>
                </p>
                <p className="small">
                  At stake: {material.outline.stakes} Villain: {material.outline.villain.name}, who wants{" "}
                  {material.outline.villain.want}
                </p>
              </div>
            ) : null}
            {material.spine ? (
              <div>
                <h4>Spine</h4>
                <ul className="thread-list">
                  {material.spine.chapters.map((ch) => (
                    <li key={ch.number}>
                      <span aria-hidden>📍</span>
                      <span>
                        Chapter {ch.number}: {ch.marker} <span className="muted">· hook: {ch.hook}</span>
                        {ch.forks.map((f) => (
                          <span key={f.id} className="muted small">
                            {" "}
                            · fork: {f.question} (
                            {f.options.map((o) => `${o.choice} → ${o.keepsOpen.join(", ")}`).join("; ")})
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="small">
                  Endings: {material.spine.endings.map((e) => `${e.title} (${e.reachedWhen})`).join(" · ")}
                </p>
              </div>
            ) : null}
            {material.bible ? (
              <div>
                <h4>Cast</h4>
                <ul className="thread-list">
                  {material.bible.cast.map((p) => (
                    <li key={p.id}>
                      <span aria-hidden>🎭</span>
                      <span>
                        {p.name} <span className="muted">({p.pronouns})</span>: {p.role}.{" "}
                        <span className="muted small">
                          Wants {p.wants} Secret: {p.secret}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <h4>Established facts</h4>
                <ul className="small">
                  {material.bible.facts.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {detail ? (
              <div>
                <h4>Chapter {detail.chapter}, prepared</h4>
                <ul className="thread-list">
                  {detail.scenes.map((sc) => (
                    <li key={`${sc.beatId ?? "extra"}:${sc.place}:${sc.question}`}>
                      <span aria-hidden>🎬</span>
                      <span>
                        {sc.situation} <span className="muted">· {sc.question}</span>
                        {sc.clues.length > 0 ? (
                          <span className="muted small">
                            {" "}
                            · clues: {sc.clues.map((c) => c.text).join("; ")}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {material.sideQuests.length > 0 ? (
              <div>
                <h4>Side quests</h4>
                <ul className="thread-list">
                  {material.sideQuests.map((q) => (
                    <li key={q.id}>
                      <span aria-hidden>🗺️</span>
                      <span>
                        {q.title}: {q.hook} <span className="muted small">· leads back to {q.leadsBack}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
        <h4>Jobs</h4>
        {writer.length === 0 ? (
          <p className="muted">Nothing yet.</p>
        ) : (
          <ul className="thread-list">
            {writer.map((j) => (
              <li key={j.id}>
                <span aria-hidden>{WRITER_ICON[j.status] ?? "•"}</span>
                <span>
                  {j.what} <span className="muted">· {j.why}</span>{" "}
                  <span className="badge">{WRITER_STATUS[j.status] ?? j.status}</span>
                  <span className="muted small">
                    {" "}
                    {[
                      j.tries > 1 ? `${j.tries} tries` : null,
                      j.minutes ? `${j.minutes} min` : null,
                      j.tokens > 0 ? `${j.tokens.toLocaleString("en")} tokens` : null,
                      j.status === "running" && j.steps.length > 0 ? `done: ${j.steps.join(", ")}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {j.error && j.status !== "done" ? <span className="muted small"> · {j.error}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
