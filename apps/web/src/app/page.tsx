import Link from "next/link";
import { currentSession } from "@/server/access";
import { inviteUrl } from "@/server/discord";
import { webEnv } from "@/server/env";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  denied: "Sign-in was cancelled on Discord.",
  signin: "Signing in didn't work. Please try again.",
};

const FEATURES = [
  {
    icon: "🧭",
    title: "A storyteller, or a helper",
    text: "Let the bot run the whole adventure, or keep a grown-up in charge: each turn waits for the DM to send, edit or rewrite it.",
  },
  {
    icon: "🛤️",
    title: "The long road and the quick way",
    text: "Heroes choose between doing things the right way and grabbing shortcuts. Both matter, in ways the table only sees later.",
  },
  {
    icon: "🎨",
    title: "Your choice of AI",
    text: "Claude by default, or OpenAI-compatible services, Gemini, models you run yourself, or any custom endpoint. Same for scene art.",
  },
  {
    icon: "🪙",
    title: "Budgets that hold",
    text: "Daily spending and picture caps per server. When the money runs out, turns go to a person in the DM room until the next day.",
  },
];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const session = await currentSession().catch(() => null);
  const env = webEnv();
  const error = params.error ? ERRORS[params.error] : undefined;
  return (
    <>
      <section className="hero">
        <h1>Adventures for the whole table, right in Discord</h1>
        <p>
          Discord Quests runs tabletop-style adventures for families and players aged 8 and up. This is where
          server admins choose the story and art AI, set budgets and look after campaigns.
        </p>
        {error ? (
          <div className="callout callout-danger" role="alert">
            {error}
          </div>
        ) : null}
        <div className="row">
          {session ? (
            <Link className="btn btn-primary btn-lg" href="/servers">
              Your servers
            </Link>
          ) : (
            <a className="btn btn-primary btn-lg" href="/auth/login">
              Sign in with Discord
            </a>
          )}
          <a className="btn btn-lg" href={inviteUrl(env.DISCORD_CLIENT_ID)}>
            Add the bot to a server
          </a>
          <Link className="btn btn-lg btn-ghost" href="/guide">
            How to set it up
          </Link>
        </div>
      </section>
      <section className="features" aria-label="Features">
        {FEATURES.map((f) => (
          <div key={f.title} className="card">
            <div className="feature-icon" aria-hidden>
              {f.icon}
            </div>
            <h3>{f.title}</h3>
            <p className="muted small">{f.text}</p>
          </div>
        ))}
      </section>
      <div className="callout">
        <p>
          <strong>Young players:</strong> Discord accounts are for people 13 and older. Players aged 8 to 12
          should play with a parent or guardian, on the guardian's account or at the same table with a
          grown-up as the DM.
        </p>
      </div>
    </>
  );
}
