"use client";

import { useId, useMemo, useState, useTransition } from "react";
import type { PresetOption, ProviderFormValues } from "@/server/providers";
import { ActionForm, SubmitButton } from "./ActionForm";
import type { FormState } from "./form-state";

type Errors = Record<string, string | undefined>;

function Field({
  label,
  name,
  hint,
  error,
  children,
}: {
  label: string;
  name: string;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={`f-${name}`}>{label}</label>
      {children}
      {error ? (
        <span className="error" id={`f-${name}-error`}>
          {error}
        </span>
      ) : hint ? (
        <span className="hint">{hint}</span>
      ) : null}
    </div>
  );
}

const inputProps = (name: string, errors: Errors) => ({
  id: `f-${name}`,
  name,
  "aria-invalid": errors[name] ? true : undefined,
  "aria-describedby": errors[name] ? `f-${name}-error` : undefined,
});

export function ProviderForm({
  kind,
  presets,
  initial,
  save,
  loadModels,
  inUse = false,
}: {
  kind: "llm" | "image";
  presets: PresetOption[];
  initial?: ProviderFormValues;
  /** The server already has services doing these jobs, so a new one is only added unless asked to take over. */
  inUse?: boolean;
  save: (fd: FormData) => Promise<FormState>;
  loadModels?: () => Promise<{ ok: true; models: string[] } | { ok: false; message: string }>;
}) {
  const editing = Boolean(initial);
  const [presetId, setPresetId] = useState(
    initial?.presetId ?? presets.find((p) => p.kind === kind)?.id ?? "",
  );
  const [errors, setErrors] = useState<Errors>({});
  const [authType, setAuthType] = useState(initial?.authType ?? "preset");
  const [fetched, setFetched] = useState<string[] | null>(null);
  const [modelsMsg, setModelsMsg] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const listId = useId();
  const p = presets.find((x) => x.id === presetId);
  const choices = presets.filter((x) => x.kind === kind);
  const modelOptions = useMemo(
    () => [...new Set([...(p?.models.map((m) => m.id) ?? []), ...(fetched ?? [])])],
    [p, fetched],
  );

  return (
    <ActionForm action={save} onDone={(s) => setErrors(s?.errors ?? {})}>
      <input type="hidden" name="kind" value={kind} />
      {editing ? (
        <>
          <input type="hidden" name="presetId" value={presetId} />
          <div className="callout">
            <strong>{p?.label ?? presetId}</strong>
            <br />
            <span className="muted small">{p?.description}</span>
          </div>
        </>
      ) : (
        <fieldset>
          <legend>Service</legend>
          <div className="preset-grid" role="radiogroup" aria-label="Service">
            {choices.map((x) => (
              <label key={x.id} className="preset">
                <input
                  type="radio"
                  name="presetId"
                  value={x.id}
                  checked={presetId === x.id}
                  onChange={() => setPresetId(x.id)}
                />
                <span className="preset-label">
                  {x.label} {x.selfHosted ? <span className="badge">self-hosted</span> : null}
                  {x.custom ? <span className="badge badge-accent">custom</span> : null}
                </span>
                <span className="preset-desc">{x.description}</span>
              </label>
            ))}
          </div>
          {errors.presetId ? <span className="error">{errors.presetId}</span> : null}
        </fieldset>
      )}

      {p ? (
        <>
          <div className="fields-2">
            <Field label="Name" name="name" hint="Only admins see this." error={errors.name}>
              <input
                type="text"
                {...inputProps("name", errors)}
                key={`name-${p.id}`}
                defaultValue={initial?.name ?? p.label.replace(/\s*\(.*\)$/, "")}
                maxLength={60}
                required
              />
            </Field>
            <Field
              label="Model"
              name="model"
              error={errors.model}
              hint={
                p.defaultModel
                  ? `Leave empty for the recommended model (${p.defaultModel}).`
                  : "The model's name exactly as the service writes it."
              }
            >
              <input
                type="text"
                {...inputProps("model", errors)}
                key={`model-${p.id}`}
                list={listId}
                defaultValue={initial?.model ?? ""}
                placeholder={p.defaultModel ?? "model name"}
                maxLength={150}
                autoComplete="off"
              />
              <datalist id={listId}>
                {modelOptions.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </Field>
          </div>

          {loadModels && kind === "llm" ? (
            <div className="row">
              <button
                type="button"
                className="btn btn-sm"
                disabled={loading}
                onClick={() =>
                  startLoading(async () => {
                    const res = await loadModels();
                    if (res.ok) {
                      setFetched(res.models);
                      setModelsMsg(
                        res.models.length > 0
                          ? `${res.models.length} models found. Start typing in the Model box to pick one.`
                          : "The service didn't list any models.",
                      );
                    } else setModelsMsg(res.message);
                  })
                }
              >
                {loading ? "Asking the service…" : "Load models from the service"}
              </button>
              {modelsMsg ? <span className="small muted">{modelsMsg}</span> : null}
            </div>
          ) : null}

          {p.baseUrlEditable ? (
            <Field
              label="Address"
              name="baseUrl"
              error={errors.baseUrl}
              hint={
                p.selfHosted || p.custom
                  ? "Must be reachable from the bot's server. Addresses on a private network only work if the bot's operator allows them."
                  : undefined
              }
            >
              <input
                type="url"
                {...inputProps("baseUrl", errors)}
                key={`url-${p.id}`}
                defaultValue={initial?.baseUrl || p.baseUrl || ""}
                placeholder={p.baseUrl ?? (kind === "llm" ? "https://example.com/v1" : "https://example.com")}
                required={!p.baseUrl}
              />
            </Field>
          ) : null}

          <Field
            label={p.needsKey ? "API key" : "API key (if the service needs one)"}
            name="apiKey"
            error={errors.apiKey}
            hint={
              <>
                {initial?.keyMask
                  ? `Saved key: ${initial.keyMask}. Leave empty to keep it. `
                  : "Encrypted before it's saved and never shown again. "}
                {p.keyUrl ? (
                  <a href={p.keyUrl} target="_blank" rel="noreferrer">
                    Get a key
                  </a>
                ) : null}
              </>
            }
          >
            <input
              type="password"
              {...inputProps("apiKey", errors)}
              autoComplete="off"
              spellCheck={false}
              maxLength={1000}
              required={p.needsKey && !initial?.keyMask}
              placeholder={initial?.keyMask ?? ""}
            />
          </Field>
          {initial?.keyMask ? (
            <label className="check-field">
              <input type="checkbox" name="removeKey" />
              <span>Remove the saved key</span>
            </label>
          ) : null}

          {p.generic ? (
            <Field
              label="Request and response"
              name="genericSpec"
              error={errors.genericSpec}
              hint={
                <>
                  JSON describing the call. Use <code>{"{{json prompt}}"}</code>, <code>{"{{width}}"}</code>,{" "}
                  <code>{"{{height}}"}</code>, <code>{"{{seed}}"}</code>, <code>{"{{model}}"}</code> and{" "}
                  <code>{"{{baseUrl}}"}</code> in the request, and paths like <code>$.images[0]</code> to say
                  where the picture is. The key is added the way the authentication setting below says.
                </>
              }
            >
              <textarea
                className="mono"
                {...inputProps("genericSpec", errors)}
                key={`spec-${p.id}`}
                defaultValue={initial?.genericSpec || p.genericSpecExample || ""}
                spellCheck={false}
              />
            </Field>
          ) : null}

          {!editing ? (
            <fieldset>
              <legend>{kind === "llm" ? "Use it for" : "Scene art"}</legend>
              <div className="stack" style={{ gap: 8 }}>
                <label className="check-field">
                  <input
                    type="radio"
                    name="useFor"
                    value={kind === "llm" ? "story" : "images"}
                    defaultChecked={!inUse}
                  />
                  <span>
                    {kind === "llm"
                      ? inUse
                        ? "Telling the whole story, instead of what does it now"
                        : "Telling the whole story"
                      : inUse
                        ? "Painting scenes, instead of what does it now"
                        : "Paint scenes with this service"}
                    <br />
                    <span className="hint">
                      {inUse
                        ? "Every job moves to this service. To use it for only some jobs, just add it and pick them on the “Who does what” page."
                        : "You can fine-tune each job on the “Who does what” page."}
                    </span>
                  </span>
                </label>
                <label className="check-field">
                  <input type="radio" name="useFor" value="none" defaultChecked={inUse} />
                  <span>
                    Just add it for now
                    {inUse ? (
                      <>
                        <br />
                        <span className="hint">The jobs keep the services they have.</span>
                      </>
                    ) : null}
                  </span>
                </label>
              </div>
              {errors.useFor ? <span className="error">{errors.useFor}</span> : null}
            </fieldset>
          ) : null}

          <details open={Boolean(p.custom && editing) || undefined}>
            <summary>More options</summary>
            <div className="stack">
              {p.custom ? (
                <>
                  <div className="fields-2">
                    <Field label="How the key is sent" name="authType" error={errors.authType}>
                      <select
                        {...inputProps("authType", errors)}
                        value={authType}
                        onChange={(e) => setAuthType(e.target.value)}
                      >
                        <option value="preset">Authorization: Bearer (usual)</option>
                        <option value="header">A custom header</option>
                        <option value="query">In the address (?key=…)</option>
                        <option value="none">No key</option>
                      </select>
                    </Field>
                    {authType === "header" || authType === "query" ? (
                      <Field
                        label={authType === "header" ? "Header name" : "Parameter name"}
                        name="authName"
                        error={errors.authName}
                      >
                        <input
                          type="text"
                          {...inputProps("authName", errors)}
                          defaultValue={initial?.authName ?? ""}
                          placeholder={authType === "header" ? "X-Api-Key" : "key"}
                        />
                      </Field>
                    ) : null}
                    {authType === "header" ? (
                      <Field label="Value prefix" name="authPrefix" hint="Optional, like “Token ”.">
                        <input
                          type="text"
                          {...inputProps("authPrefix", errors)}
                          defaultValue={initial?.authPrefix ?? ""}
                        />
                      </Field>
                    ) : null}
                  </div>
                  {kind === "llm" ? (
                    <Field
                      label="Structured answers"
                      name="structured"
                      hint="How the bot asks for answers in the exact shape it needs. If tests fail with a format error, try the next option down."
                    >
                      <select
                        {...inputProps("structured", errors)}
                        defaultValue={initial?.structured ?? "preset"}
                      >
                        <option value="preset">Recommended for this service</option>
                        <option value="json_schema">JSON schema (strictest)</option>
                        <option value="json_object">JSON mode</option>
                        <option value="prompt_only">Instructions only (works everywhere)</option>
                      </select>
                    </Field>
                  ) : null}
                  <label className="check-field">
                    <input type="checkbox" name="selfHosted" defaultChecked={initial?.selfHosted ?? false} />
                    <span>
                      This runs on my own network
                      <br />
                      <span className="hint">
                        Private addresses (like 192.168.x.x or localhost) are only reachable if the bot's
                        operator turned on ALLOW_PRIVATE_ENDPOINTS.
                      </span>
                    </span>
                  </label>
                </>
              ) : null}
              <Field
                label="Extra headers"
                name="extraHeaders"
                error={errors.extraHeaders}
                hint="One per line, like “HTTP-Referer: https://example.com”. Stored as plain text, so never put keys here."
              >
                <textarea
                  {...inputProps("extraHeaders", errors)}
                  defaultValue={initial?.extraHeaders ?? ""}
                  rows={3}
                />
              </Field>
              <fieldset>
                <legend>Prices (for the daily budget)</legend>
                <p className="hint" style={{ marginTop: 0 }}>
                  {p.models.length > 0
                    ? "Known models are already priced. Fill these in only for a model the list doesn't include."
                    : "So the daily budget can count this service's cost. Applies to the model above. Leave empty if it's free."}
                </p>
                <div className="fields-2">
                  {kind === "llm" ? (
                    <>
                      <Field label="Input, $ per million tokens" name="priceInput" error={errors.priceInput}>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          {...inputProps("priceInput", errors)}
                          defaultValue={initial?.priceInput ?? ""}
                        />
                      </Field>
                      <Field
                        label="Output, $ per million tokens"
                        name="priceOutput"
                        error={errors.priceOutput}
                      >
                        <input
                          type="number"
                          step="any"
                          min="0"
                          {...inputProps("priceOutput", errors)}
                          defaultValue={initial?.priceOutput ?? ""}
                        />
                      </Field>
                    </>
                  ) : (
                    <Field label="$ per picture" name="priceImage" error={errors.priceImage}>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        {...inputProps("priceImage", errors)}
                        defaultValue={initial?.priceImage ?? ""}
                      />
                    </Field>
                  )}
                </div>
              </fieldset>
            </div>
          </details>

          {editing ? (
            <label className="check-field">
              <input type="checkbox" name="enabled" defaultChecked={initial?.enabled ?? true} />
              <span>Switched on</span>
            </label>
          ) : (
            <input type="hidden" name="enabled" value="on" />
          )}

          <div className="form-actions">
            <SubmitButton>{editing ? "Save" : "Add service"}</SubmitButton>
          </div>
        </>
      ) : null}
    </ActionForm>
  );
}
