import Link from "next/link";
import type { ProviderSummary, TestResult } from "@/server/providers";
import { TASK_INFO } from "@/server/tasks";
import { TestButton } from "./TestButton";

export function ProviderCard({
  guildId,
  p,
  test,
}: {
  guildId: string;
  p: ProviderSummary;
  test: () => Promise<TestResult>;
}) {
  return (
    <div className="card">
      <div className="card-head">
        <div style={{ minWidth: 0 }}>
          <h3 style={{ overflowWrap: "anywhere" }}>{p.name}</h3>
          <span className="muted small">{p.presetLabel}</span>
        </div>
        {p.enabled ? <span className="badge badge-ok">On</span> : <span className="badge">Off</span>}
      </div>
      <dl className="kv">
        {p.model ? (
          <>
            <dt>Model</dt>
            <dd>
              <code>{p.model}</code>
            </dd>
          </>
        ) : null}
        {p.baseUrl ? (
          <>
            <dt>Address</dt>
            <dd>
              <code>{p.baseUrl}</code>
            </dd>
          </>
        ) : null}
        <dt>Key</dt>
        <dd>{p.keyMask ?? <span className="muted">none</span>}</dd>
        <dt>Used for</dt>
        <dd>
          {p.tasks.length > 0 ? (
            p.tasks.map((t) => TASK_INFO[t as keyof typeof TASK_INFO]?.label ?? t).join(", ")
          ) : (
            <span className="muted">nothing yet</span>
          )}
        </dd>
      </dl>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <Link className="btn btn-sm" href={`/servers/${guildId}/providers/${p.id}`}>
          Edit
        </Link>
        <TestButton test={test} kind={p.kind} />
      </div>
    </div>
  );
}
