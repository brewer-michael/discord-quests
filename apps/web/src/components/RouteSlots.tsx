"use client";

import { useState } from "react";

export interface RouteService {
  id: string;
  name: string;
  enabled: boolean;
  /** Models known for this service: its own, its preset's, and any a job already uses with it. */
  models: string[];
  defaultModel: string | null;
  /** Each documented model's reasoning: whether it reasons, and the levels its provider lists. */
  reasoning: Record<string, { mode: "always" | "optional" | "none"; efforts: string[] }>;
}

export interface RouteSlotValue {
  providerId: string;
  model: string;
  effort: string | null;
}

const OTHER = "__other__";

/**
 * One job's choices, best first. Each row's models are the chosen service's own, so another service's models
 * never crowd them out, and "Other…" takes any model name the service knows.
 */
export function RouteSlots({
  labels,
  services,
  current,
  efforts,
}: {
  labels: readonly string[];
  services: RouteService[];
  current: Array<RouteSlotValue | undefined>;
  /** Effort levels, for story jobs; picture jobs have none. */
  efforts?: readonly string[];
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Order</th>
            <th scope="col">Service</th>
            <th scope="col">Model</th>
            {efforts ? <th scope="col">Effort</th> : null}
          </tr>
        </thead>
        <tbody>
          {labels.map((label, i) => (
            <Slot
              key={label}
              i={i}
              label={label}
              services={services}
              initial={current[i]}
              efforts={efforts}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Slot({
  i,
  label,
  services,
  initial,
  efforts,
}: {
  i: number;
  label: string;
  services: RouteService[];
  initial: RouteSlotValue | undefined;
  efforts?: readonly string[];
}) {
  const [providerId, setProviderId] = useState(initial?.providerId ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const known = services.find((s) => s.id === providerId)?.models ?? [];
  const [typing, setTyping] = useState(Boolean(initial?.model) && !known.includes(initial?.model ?? ""));
  const listed = !typing && known.length > 0;

  return (
    <tr>
      <td className="small muted">{label}</td>
      <td style={{ minWidth: 180 }}>
        <select
          name={`providerId.${i}`}
          value={providerId}
          aria-label={`${label}: service`}
          onChange={(e) => {
            const next = services.find((s) => s.id === e.target.value);
            setProviderId(e.target.value);
            setModel(next?.defaultModel ?? next?.models[0] ?? "");
            setTyping(false);
          }}
        >
          <option value="">—</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.enabled ? "" : " (off)"}
            </option>
          ))}
        </select>
      </td>
      <td style={{ minWidth: 200 }}>
        {listed ? (
          <select
            name={`model.${i}`}
            value={known.includes(model) ? model : ""}
            aria-label={`${label}: model`}
            onChange={(e) => {
              if (e.target.value === OTHER) {
                setTyping(true);
                setModel("");
              } else setModel(e.target.value);
            }}
          >
            {known.includes(model) ? null : <option value="">Choose a model</option>}
            {known.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            <option value={OTHER}>Other…</option>
          </select>
        ) : (
          <div className="row" style={{ gap: 6 }}>
            <input
              type="text"
              name={`model.${i}`}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              aria-label={`${label}: model`}
              placeholder={providerId ? "Model name" : ""}
              disabled={!providerId}
              autoComplete="off"
            />
            {typing && known.length > 0 ? (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  setTyping(false);
                  setModel(known[0] ?? "");
                }}
              >
                List
              </button>
            ) : null}
          </div>
        )}
      </td>
      {efforts ? (
        <td style={{ minWidth: 120 }}>
          <EffortSelect
            name={`effort.${i}`}
            label={label}
            initial={initial?.effort ?? ""}
            all={efforts}
            documented={services.find((s) => s.id === providerId)?.reasoning[model]}
          />
        </td>
      ) : null}
    </tr>
  );
}

/** How hard the job's model reasons: the levels its provider documents for it, or every level when it's undocumented. */
function EffortSelect({
  name,
  label,
  initial,
  all,
  documented,
}: {
  name: string;
  label: string;
  initial: string;
  all: readonly string[];
  documented: RouteService["reasoning"][string] | undefined;
}) {
  if (documented?.mode === "none")
    return (
      <select name={name} value="" disabled aria-label={`${label}: effort`}>
        <option value="">Doesn't reason</option>
      </select>
    );
  const levels = documented?.efforts.length
    ? documented.efforts.filter((e) => documented.mode !== "always" || e !== "none")
    : all;
  return (
    <select
      key={levels.join(",")}
      name={name}
      defaultValue={levels.includes(initial) ? initial : ""}
      aria-label={`${label}: effort`}
    >
      <option value="">Default</option>
      {levels.map((e) => (
        <option key={e} value={e}>
          {e === "none" ? "off" : e}
        </option>
      ))}
    </select>
  );
}
