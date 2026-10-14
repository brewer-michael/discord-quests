import { requireGuild } from "@/server/access";
import { services } from "@/server/db";
import { serverSettings } from "@/server/settings";
import { TASK_INFO } from "@/server/tasks";
import { dailyUsage, usageBreakdown } from "@/server/usage";

export const metadata = { title: "Usage" };
export const dynamic = "force-dynamic";

const usd = (n: number) => (n > 0 && n < 0.01 ? "<$0.01" : `$${n.toFixed(2)}`);
const tokens = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n);

export default async function Usage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  await requireGuild(guildId);
  const db = services().handle.db;
  const [days, breakdown, settings] = await Promise.all([
    dailyUsage(db, guildId),
    usageBreakdown(db, guildId),
    serverSettings(db, guildId),
  ]);
  const today = days.at(-1) ?? { usd: 0, tokens: 0, images: 0, day: "" };
  const total = days.reduce((s, d) => s + d.usd, 0);
  const max = Math.max(0.0001, ...days.map((d) => d.usd));
  const budget = settings.dailyBudgetUsd;
  const pct = budget ? Math.min(100, (today.usd / Math.max(budget, 0.0001)) * 100) : 0;

  return (
    <>
      <h2>Usage</h2>
      <div className="grid">
        <div className="card">
          <div className="muted small">Today (UTC)</div>
          <div className="stat">{usd(today.usd)}</div>
          {budget !== null ? (
            <>
              <div className={`meter ${pct >= 100 ? "meter-over" : ""}`} style={{ marginTop: 8 }}>
                <span style={{ width: `${pct}%` }} />
              </div>
              <div className="hint">of {usd(budget)} daily budget</div>
            </>
          ) : (
            <div className="hint">No daily budget set</div>
          )}
        </div>
        <div className="card">
          <div className="muted small">Pictures today</div>
          <div className="stat">{today.images}</div>
          <div className="hint">
            {settings.dailyImageCap !== null
              ? `of ${settings.dailyImageCap} a day`
              : "No daily picture limit"}
          </div>
        </div>
        <div className="card">
          <div className="muted small">Last 30 days</div>
          <div className="stat">{usd(total)}</div>
          <div className="hint">{tokens(days.reduce((s, d) => s + d.tokens, 0))} tokens</div>
        </div>
      </div>

      <div className="card">
        <h3>Spending per day</h3>
        <div
          className="bars"
          role="img"
          aria-label={`Daily spending for the last 30 days, ${usd(total)} in total`}
        >
          {days.map((d) => (
            <div
              key={d.day}
              className={`bar ${d.usd === 0 ? "bar-empty" : ""}`}
              style={{ height: `${d.usd === 0 ? 2 : Math.max(4, (d.usd / max) * 100)}%` }}
              title={`${d.day}: ${usd(d.usd)}, ${tokens(d.tokens)} tokens, ${d.images} pictures`}
            />
          ))}
        </div>
        <div className="bars-axis">
          <span>{days[0]?.day}</span>
          <span>{today.day}</span>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          Costs are estimates from each model's published prices. Built-in services count too.
        </p>
      </div>

      <div className="card">
        <h3>Last 7 days by job</h3>
        {breakdown.length === 0 ? (
          <p className="muted">Nothing yet.</p>
        ) : (
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Job</th>
                  <th scope="col">Model</th>
                  <th scope="col" className="num">
                    Calls
                  </th>
                  <th scope="col" className="num">
                    Tokens
                  </th>
                  <th scope="col" className="num">
                    Pictures
                  </th>
                  <th scope="col" className="num">
                    Cost
                  </th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((b) => (
                  <tr key={`${b.task}-${b.model}`}>
                    <td>
                      {TASK_INFO[b.task as keyof typeof TASK_INFO]?.label ??
                        (b.task === "connection_test" ? "Connection tests" : b.task)}
                    </td>
                    <td>
                      <code>{b.model}</code>
                      {b.fellBack > 0 ? (
                        <span className="badge badge-warn"> {b.fellBack} fallbacks</span>
                      ) : null}
                    </td>
                    <td className="num">{b.calls}</td>
                    <td className="num">{tokens(Number(b.tokens))}</td>
                    <td className="num">{b.images}</td>
                    <td className="num">{usd(Number(b.usd))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
