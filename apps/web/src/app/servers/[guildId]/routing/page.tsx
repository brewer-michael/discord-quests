import { preset } from "@dq/providers";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
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
  const models = (kind: "llm" | "image") => {
    const set = new Set<string>();
    for (const p of providers.filter((x) => x.kind === kind)) {
      if (p.model) set.add(p.model);
      for (const m of preset(p.presetId)?.models ?? []) set.add(m.id);
    }
    for (const [task, list] of Object.entries(routes))
      if ((task === "image") === (kind === "image")) for (const r of list) set.add(r.model);
    return [...set].sort();
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
      <datalist id="models-llm">
        {models("llm").map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <datalist id="models-image">
        {models("image").map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
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
                ? "the engine telling the story on its own"
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
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Order</th>
                        <th scope="col">Service</th>
                        <th scope="col">Model</th>
                        {kind === "llm" ? <th scope="col">Effort</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {SLOTS.map((label, i) => {
                        const r = current[i];
                        return (
                          <tr key={label}>
                            <td className="small muted">{label}</td>
                            <td style={{ minWidth: 180 }}>
                              <select
                                name={`providerId.${i}`}
                                defaultValue={r?.providerId ?? ""}
                                aria-label={`${label}: service`}
                              >
                                <option value="">—</option>
                                {options.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                    {p.enabled ? "" : " (off)"}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td style={{ minWidth: 200 }}>
                              <input
                                type="text"
                                name={`model.${i}`}
                                defaultValue={r?.model ?? ""}
                                list={`models-${kind}`}
                                aria-label={`${label}: model`}
                                autoComplete="off"
                              />
                            </td>
                            {kind === "llm" ? (
                              <td style={{ minWidth: 120 }}>
                                <select
                                  name={`effort.${i}`}
                                  defaultValue={r?.effort ?? ""}
                                  aria-label={`${label}: effort`}
                                >
                                  <option value="">Default</option>
                                  {EFFORTS.map((e) => (
                                    <option key={e} value={e}>
                                      {e}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
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
