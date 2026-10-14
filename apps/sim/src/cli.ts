/**
 * pnpm sim                       Monte Carlo report (200 runs per player style)
 * pnpm sim report --runs 1000    bigger report
 * pnpm sim transcript --policy merciful --seed demo
 */

import { formatReport, runMonteCarlo } from "./report";
import { POLICIES, type Policy, simulateCampaign } from "./simulate";
import { loadIndex } from "./world";

const args = process.argv.slice(2);
const cmd = args[0] && !args[0].startsWith("--") ? args[0] : "report";
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? (args[i + 1] as string) : fallback;
};

const index = loadIndex();
if (cmd === "transcript") {
  const policy = flag("policy", "merciful") as Policy;
  if (!POLICIES.includes(policy)) throw new Error(`policy must be one of ${POLICIES.join(", ")}`);
  const run = simulateCampaign(index, { policy, seed: flag("seed", "demo"), transcript: true });
  console.log(run.transcript.join("\n"));
} else {
  const runs = Number(flag("runs", "200"));
  console.log(formatReport(runMonteCarlo(index, runs), index));
}
