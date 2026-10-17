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
          This shows this campaign's story as only its director sees it (the threats, what's ahead, everyone's
          secrets) and what the hidden hand is holding in <strong>{campaign.name}</strong>: which good deeds
          are waiting to matter, which shortcuts will come back around, and who is being kept safe for later.
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

  const { loom, story } = view;
  return (
    <>
      <div className="card">
        {back}
        <h2>The hidden hand in {campaign.name}</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Shown in words, not numbers, on purpose. This view closes after 15 minutes.
        </p>
      </div>
      {story ? (
        <>
          <div className="card">
            <h3>The story: {story.title}</h3>
            <p className="hint">
              Chapter {story.chapter.number}: {story.chapter.title} · {story.scenesPlayed} scenes played ·{" "}
              {story.length} story
            </p>
            <p>{story.pitch}</p>
            <p className="muted">Stakes: {story.stakes}</p>
            {story.storySoFar ? <p>{story.storySoFar}</p> : null}
            {story.hooks.length > 0 ? (
              <ul className="thread-list">
                {story.hooks.map((h) => (
                  <li key={h.hero}>
                    <span aria-hidden>🎒</span>
                    <span>
                      {h.hero} <span className="muted">· {h.hook}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="grid">
            <div className="card">
              <h3>Threats</h3>
              <p className="hint">What comes true, step by step, while nobody stops it.</p>
              <ul className="thread-list">
                {story.fronts.map((f) => (
                  <li key={f.name}>
                    <span aria-hidden>
                      {f.state === "thwarted" ? "🛡️" : f.state === "doomed" ? "🌑" : "⏳"}
                    </span>
                    <span>
                      {f.name}{" "}
                      {f.central ? <span className="badge badge-accent">the central trouble</span> : null}{" "}
                      <span className="badge">{f.state}</span>
                      {f.come.length > 0 ? (
                        <span className="muted"> · Has come true: {f.come.at(-1)}</span>
                      ) : null}
                      {f.next ? <span className="muted"> · Next: {f.next}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card">
              <h3>Decisive moments</h3>
              <p className="hint">They come when the story has earned them, the finale last.</p>
              <ul className="thread-list">
                {story.moments.map((m) => (
                  <li key={m.title}>
                    <span aria-hidden>{m.state === "done" ? "✔️" : m.finale ? "🏔️" : "⚑"}</span>
                    <span>
                      {m.title} <span className="muted">· {m.when}</span>{" "}
                      {m.outcome ? <span className="badge">{words(m.outcome)}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="grid">
            <div className="card">
              <h3>Mysteries</h3>
              <ul className="thread-list">
                {story.mysteries.map((m) => (
                  <li key={m.question}>
                    <span aria-hidden>🔎</span>
                    <span>
                      {m.question}{" "}
                      <span className="badge">
                        {m.found} of {m.clues} clues
                      </span>
                      <span className="muted"> · {m.truth}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card">
              <h3>People</h3>
              <ul className="thread-list">
                {story.cast.map((p) => (
                  <li key={p.name}>
                    <span aria-hidden>👤</span>
                    <span>
                      {p.name} <span className="muted">· {p.role}</span>{" "}
                      <span className="badge">{p.attitude}</span> <span className="badge">{p.status}</span>
                      {p.secret ? <span className="muted"> · Secret: {p.secret}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      ) : null}
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
    </>
  );
}
