import { requireGuild } from "@/server/access";
import { recentAudit } from "@/server/audit";
import { services } from "@/server/db";

export const metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

const LABELS: Record<string, string> = {
  "provider.create": "Added a service",
  "provider.update": "Changed a service",
  "provider.delete": "Removed a service",
  "provider.test": "Tested a service",
  "routes.update": "Changed who does what",
  "settings.update": "Changed settings",
  "campaign.pause": "Paused a campaign",
  "campaign.resume": "Resumed a campaign",
  "campaign.end": "Ended a campaign",
  "campaign.delete": "Deleted a campaign",
  "loom.view": "Looked at the hidden hand",
};

function describe(detail: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof detail.name === "string") parts.push(detail.name);
  if (detail.keyChanged === true) parts.push("key changed");
  if (typeof detail.ok === "boolean") parts.push(detail.ok ? "worked" : "failed");
  return parts.join(" · ");
}

export default async function Activity({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  await requireGuild(guildId);
  const rows = await recentAudit(services().handle.db, guildId);
  return (
    <>
      <div>
        <h2>Activity</h2>
        <p className="muted">Changes made on this site, newest first. Keys are never recorded.</p>
      </div>
      {rows.length === 0 ? (
        <div className="callout">Nothing yet.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">When (UTC)</th>
                <th scope="col">Who</th>
                <th scope="col">What</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="small" style={{ whiteSpace: "nowrap" }}>
                    {r.at.toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="small">
                    <code>{r.userId}</code>
                  </td>
                  <td>
                    {LABELS[r.action] ?? r.action}
                    {describe(r.detail) ? <span className="muted small"> · {describe(r.detail)}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
