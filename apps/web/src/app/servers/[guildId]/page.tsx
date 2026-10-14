import { guilds } from "@dq/db";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { ProviderCard } from "@/components/ProviderCard";
import { requireGuild } from "@/server/access";
import { services } from "@/server/db";
import { listProviders } from "@/server/providers";
import { guildRoutes } from "@/server/routes";
import { serverSettings } from "@/server/settings";
import { testProviderAction } from "./actions";

export const metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

function Check({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li>
      <span className={`check ${done ? "check-done" : ""}`} role="img" aria-label={done ? "Done" : "To do"}>
        {done ? "✓" : "·"}
      </span>
      <div>{children}</div>
    </li>
  );
}

export default async function Overview({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  await requireGuild(guildId);
  const { handle, store } = services();
  const db = handle.db;
  const [providers, routes, settings, [g]] = await Promise.all([
    listProviders(db, guildId),
    guildRoutes(db, guildId),
    serverSettings(db, guildId),
    db.select({ botPresent: guilds.botPresent }).from(guilds).where(eq(guilds.id, guildId)),
  ]);
  const platformStory = settings.usePlatformDefaults && (store.defaults.routes.narrator?.length ?? 0) > 0;
  const platformImages = settings.usePlatformDefaults && (store.defaults.routes.image?.length ?? 0) > 0;
  const story = providers.filter((p) => p.kind === "llm");
  const images = providers.filter((p) => p.kind === "image");
  const hasStory = routes.narrator.length > 0;
  const hasImages = routes.image.length > 0;
  const ownKeys = providers.some((p) => p.keyMask);

  return (
    <>
      <div className="card">
        <h2>Getting ready</h2>
        <ul className="checklist" style={{ marginTop: 12 }}>
          <Check done={Boolean(g?.botPresent)}>
            <strong>Add the bot to the server.</strong>{" "}
            <span className="muted">
              Then anyone can start with <code>/campaign new</code>.
            </span>
          </Check>
          <Check done={hasStory || platformStory}>
            <strong>Choose a storyteller.</strong>{" "}
            <span className="muted">
              {hasStory
                ? "Your own story service is set up."
                : platformStory
                  ? "Using this bot's built-in storyteller for now. Add your own service to choose the model or lift the shared daily limit."
                  : "Add a story service below. Until then the engine tells a simpler story on its own."}
            </span>
          </Check>
          <Check done={hasImages || platformImages || settings.game.imagePolicy === "off"}>
            <strong>Choose who paints the scenes.</strong>{" "}
            <span className="muted">
              {hasImages
                ? "Scene art is set up."
                : platformImages
                  ? "Using this bot's built-in picture service."
                  : settings.game.imagePolicy === "off"
                    ? "Scene art is switched off."
                    : "Optional: add a picture service for scene art."}
            </span>
          </Check>
          <Check done={!ownKeys || settings.dailyBudgetUsd !== null}>
            <strong>Set a daily budget.</strong>{" "}
            <span className="muted">
              {ownKeys
                ? settings.dailyBudgetUsd !== null
                  ? `Up to $${settings.dailyBudgetUsd.toFixed(2)} a day. `
                  : "Your own keys have no daily limit yet. "
                : "Not needed while you use the bot's built-in services. "}
              <Link href={`/servers/${guildId}/settings`}>Settings &amp; budget</Link>
            </span>
          </Check>
        </ul>
      </div>

      <div className="section-head">
        <div>
          <h2>Story services</h2>
          <p className="muted small" style={{ margin: 0 }}>
            The AI that tells the story. Claude is the default; any OpenAI-compatible service, Gemini or your
            own endpoint works too.
          </p>
        </div>
        <Link className="btn btn-primary" href={`/servers/${guildId}/providers/new?kind=llm`}>
          Add a story service
        </Link>
      </div>
      {story.length === 0 ? (
        <div className="callout">No story services yet.</div>
      ) : (
        <div className="grid">
          {story.map((p) => (
            <ProviderCard
              key={p.id}
              guildId={guildId}
              p={p}
              test={testProviderAction.bind(null, guildId, p.id)}
            />
          ))}
        </div>
      )}

      <div className="section-head">
        <div>
          <h2>Picture services</h2>
          <p className="muted small" style={{ margin: 0 }}>
            Paints a scene when the party reaches a new place or challenge.
          </p>
        </div>
        <Link className="btn btn-primary" href={`/servers/${guildId}/providers/new?kind=image`}>
          Add a picture service
        </Link>
      </div>
      {images.length === 0 ? (
        <div className="callout">No picture services yet.</div>
      ) : (
        <div className="grid">
          {images.map((p) => (
            <ProviderCard
              key={p.id}
              guildId={guildId}
              p={p}
              test={testProviderAction.bind(null, guildId, p.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}
