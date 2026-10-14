import type { LoomTuning } from "@dq/core/loom";
import type { WorldIndex } from "@dq/core/world";
import { POLICIES, type Policy, type SimRun, simulateCampaign } from "./simulate";

export interface PolicySummary {
  policy: Policy;
  runs: number;
  /** Per crux: share of each outcome. */
  cruxes: Record<string, Record<string, number>>;
  /** Share of runs where the final crux was carried (anything but fail-forward). */
  finaleCarried: number;
  finaleOwnSuccess: number;
  avgMinorGraces: number;
  avgThreads: number;
  avgSnares: number;
  detourPlanted: number;
  /** Paid off or repurposed, out of detours whose moment has passed. */
  detourPayoffRate: number;
  maxOptionalIn10: number;
  snibbetAtFinale: number;
}

export function runMonteCarlo(
  index: WorldIndex,
  runs: number,
  tuning: Partial<LoomTuning> = {},
): PolicySummary[] {
  return POLICIES.map((policy) =>
    summarize(
      policy,
      Array.from({ length: runs }, (_, i) =>
        simulateCampaign(index, { policy, seed: `${policy}-${i}`, tuning }),
      ),
    ),
  );
}

export function summarize(policy: Policy, runs: SimRun[]): PolicySummary {
  const n = runs.length;
  const cruxes: PolicySummary["cruxes"] = {};
  for (const r of runs) {
    for (const c of r.cruxes) {
      cruxes[c.beatId] ??= {};
      const row = cruxes[c.beatId] as Record<string, number>;
      row[c.outcome] = (row[c.outcome] ?? 0) + 1 / n;
    }
  }
  const finale = runs.map((r) => r.cruxes.at(-1));
  const planted = runs.reduce((s, r) => s + r.detours.planted, 0);
  const settled = runs.reduce((s, r) => s + r.detours.paidOff + r.detours.repurposed, 0);
  const open = runs.reduce((s, r) => s + r.detours.open, 0);
  return {
    policy,
    runs: n,
    cruxes,
    finaleCarried: finale.filter((c) => c && c.outcome !== "fail_forward").length / n,
    finaleOwnSuccess: finale.filter((c) => c?.outcome === "success").length / n,
    avgMinorGraces: runs.reduce((s, r) => s + r.minorGraces, 0) / n,
    avgThreads: runs.reduce((s, r) => s + r.threadsPlanted, 0) / n,
    avgSnares: runs.reduce((s, r) => s + r.snaresTied, 0) / n,
    detourPlanted: planted / n,
    detourPayoffRate: planted - open > 0 ? settled / (planted - open) : 1,
    maxOptionalIn10: Math.max(0, ...runs.map((r) => r.maxOptionalIn10)),
    snibbetAtFinale: runs.filter((r) => r.snibbetPresentAtFinale).length / n,
  };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function formatReport(summaries: PolicySummary[], index: WorldIndex): string {
  const lines: string[] = [];
  lines.push("# Loom simulation report", "");
  lines.push(
    "| Player style | Finale carried | Finale won unaided | Graces/run | Threads/run | Snares/run | Detours/run | Detour payoff | Max optional events in 10 turns | Snibbet at finale |",
  );
  lines.push("|---|---|---|---|---|---|---|---|---|---|");
  for (const s of summaries) {
    lines.push(
      `| ${s.policy} | ${pct(s.finaleCarried)} | ${pct(s.finaleOwnSuccess)} | ${s.avgMinorGraces.toFixed(2)} | ${s.avgThreads.toFixed(1)} | ${s.avgSnares.toFixed(1)} | ${s.detourPlanted.toFixed(2)} | ${pct(s.detourPayoffRate)} | ${s.maxOptionalIn10} | ${pct(s.snibbetAtFinale)} |`,
    );
  }
  lines.push("", "## Decisive moments", "");
  const outcomes = ["success", "success_by_convergence", "costly_success", "fail_forward"];
  for (const s of summaries) {
    lines.push(
      `### ${s.policy} (${s.runs} runs)`,
      "",
      "| Crux | Won unaided | Carried by the hidden hand | Costly | Fail forward |",
      "|---|---|---|---|---|",
    );
    for (const [beatId, row] of Object.entries(s.cruxes)) {
      const title = index.beats.get(beatId)?.beat.title ?? beatId;
      lines.push(`| ${title} | ${outcomes.map((o) => pct(row[o] ?? 0)).join(" | ")} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
