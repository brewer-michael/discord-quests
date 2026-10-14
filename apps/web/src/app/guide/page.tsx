import { GUIDE } from "@dq/engine/guide";
import Link from "next/link";
import type { ReactNode } from "react";
import { inviteUrl } from "@/server/discord";
import { webEnv } from "@/server/env";

export const metadata = { title: "Setup guide" };
export const dynamic = "force-dynamic";

/** The guide's light markdown: **bold** and `code`. */
function rich(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
    part.startsWith("**") ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: static text split
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : part.startsWith("`") ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: static text split
      <code key={i}>{part.slice(1, -1)}</code>
    ) : (
      part
    ),
  );
}

export default function Guide() {
  const env = webEnv();
  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <div>
        <h1>Setting up Discord Quests</h1>
        <p className="muted">
          Five steps, about ten minutes. You need the <strong>Manage Server</strong> permission on your
          Discord server.
        </p>
        <div className="row">
          <a className="btn btn-primary" href={inviteUrl(env.DISCORD_CLIENT_ID)}>
            Add the bot to a server
          </a>
          <Link className="btn" href="/servers">
            Choose the storyteller AI
          </Link>
        </div>
      </div>
      <nav className="card" aria-label="On this page">
        <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>
          {GUIDE.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`}>{s.title.replace(/^\d+\.\s*/, "")}</a>
            </li>
          ))}
        </ol>
      </nav>
      {GUIDE.map((s) => (
        <section key={s.id} id={s.id} className="card" aria-labelledby={`h-${s.id}`}>
          <h2 id={`h-${s.id}`}>{s.title}</h2>
          {s.intro ? <p>{rich(s.intro)}</p> : null}
          {s.steps ? (
            <ul className="guide-steps">
              {s.steps.map((step) => (
                <li key={step}>{rich(step)}</li>
              ))}
            </ul>
          ) : null}
          {s.notes?.map((n) => (
            <p key={n} className="callout small">
              {rich(n)}
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}
