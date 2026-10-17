import { preset } from "@dq/providers";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { type RouteService, RouteSlots } from "@/components/RouteSlots";
import { requireGuild } from "@/server/access";
import { services } from "@/server/db";
import { listProviders } from "@/server/providers";
import { guildRoutes } from "@/server/routes";
import { serverSettings } from "@/server/settings";
import { ALL_TASKS, EFFORTS, TASK_INFO } from "@/server/tasks";
import { saveRoutesAction } from "../actions";

export const metadata = { title: "Who does what" };
export const dynamic = "force-dynamic";

const SLOTS = ["First choice", "If that fails", "Last resort"];

export default async function Routing({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  await requireGuild(guildId);
  const { handle, store } = services();
  const [providers, routes, settings] = await Promise.all([
    listProviders(handle.db, guildId),
    guildRoutes(handle.db, guildId),
    serverSettings(handle.db, guildId),
  ]);
  // Each service's own models: the one saved with it, its preset's, and any a job already uses with it.
  const routed = Object.values(routes).flat();
  const service = (p: (typeof providers)[number]): RouteService => {
    const pre = preset(p.presetId);
    const preferred =
      p.model ?? (p.kind === "image" ? pre?.defaultModels.image : pre?.defaultModels.narrator);
    const models = new Set<string>([
      ...(preferred ? [preferred] : []),
      ...(pre?.models.map((m) => m.id) ?? []),
      ...routed.filter((r) => r.providerId === p.id).map((r) => r.model),
    ]);
    return {
      id: p.id,
      name: p.name,
      enabled: p.enabled,
      models: [...models],
      defaultModel: preferred ?? null,
    };
  };

  return (
    <>
      <div>
        <h2>Who does what</h2>
        <p className="muted">
          The story uses several small jobs. Give each one a service and model, with backups if the first one
          is down. Quick jobs can use a faster, cheaper model.
        </p>
      </div>
      {ALL_TASKS.map((task) => {
        const kind = task === "image" ? "image" : "llm";
        const options = providers.filter((p) => p.kind === kind);
        const current = routes[task];
        const fallback =
          settings.usePlatformDefaults && (store.defaults.routes[task]?.length ?? 0) > 0
            ? "the bot's built-in service"
            : task === "image"
              ? "no scene art"
              : task === "narrator"
                ? "every turn goes to the DM room for a person to tell"
                : "skipping this job";
        return (
          <section key={task} className="card" aria-labelledby={`t-${task}`}>
            <div className="card-head">
              <div>
                <h3 id={`t-${task}`}>{TASK_INFO[task].label}</h3>
                <p className="muted small" style={{ margin: 0 }}>
                  {TASK_INFO[task].help}
                </p>
              </div>
              {current.length > 0 ? (
                <span className="badge badge-ok">Set</span>
              ) : (
                <span className="badge">Default</span>
              )}
            </div>
            {options.length === 0 ? (
              <p className="muted small">
                Add a {kind === "llm" ? "story" : "picture"} service first. Until then: {fallback}.
              </p>
            ) : (
              <ActionForm action={saveRoutesAction.bind(null, guildId, task)}>
                <RouteSlots
                  labels={SLOTS}
                  services={options.map(service)}
                  current={current}
                  {...(kind === "llm" ? { efforts: EFFORTS } : {})}
                />
                <div className="form-actions">
                  <SubmitButton>Save</SubmitButton>
                  <span className="hint">With nothing chosen: {fallback}.</span>
                </div>
              </ActionForm>
            )}
          </section>
        );
      })}
      <p className="hint">
        Effort only applies to services that support it (like Claude): higher effort thinks harder and costs
        more.
      </p>
    </>
  );
}
