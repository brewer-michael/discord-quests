import Link from "next/link";
import { ProviderForm } from "@/components/ProviderForm";
import { requireGuild } from "@/server/access";
import { services } from "@/server/db";
import { presetOptions } from "@/server/providers";
import { guildRoutes } from "@/server/routes";
import { STORY_TASKS } from "@/server/tasks";
import { saveProviderAction } from "../../actions";

export const metadata = { title: "Add a service" };

export default async function NewProvider({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const { guildId } = await params;
  const kind = (await searchParams).kind === "image" ? "image" : "llm";
  await requireGuild(guildId);
  const routes = await guildRoutes(services().handle.db, guildId);
  const inUse = kind === "llm" ? STORY_TASKS.some((t) => routes[t].length > 0) : routes.image.length > 0;
  return (
    <div className="card">
      <p className="small">
        <Link href={`/servers/${guildId}`}>← Overview</Link>
      </p>
      <h2>{kind === "llm" ? "Add a story service" : "Add a picture service"}</h2>
      <p className="muted">
        {kind === "llm"
          ? "Pick the service that will tell the story. Anything OpenAI-compatible works, including models you run yourself."
          : "Pick the service that paints scenes. Any HTTP image API can be described with the custom option."}
      </p>
      <ProviderForm
        kind={kind}
        presets={presetOptions()}
        save={saveProviderAction.bind(null, guildId, null)}
        inUse={inUse}
      />
    </div>
  );
}
