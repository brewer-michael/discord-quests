import type { Rng } from "../rng/index";
import type { World } from "../world/types";
import type { LoomState, Thread } from "./types";

export type EpilogueStyle = "subtle" | "explicit" | "off";

/** First sentence of a passage, with its final punctuation. */
function firstSentence(s: string): string {
  const m = /^(.+?[.!?])(\s|$)/.exec(s.trim());
  return (m?.[1] ?? s.trim()).trim();
}

/** Turns "Let Snibbet go free." into "let Snibbet go free", keeping proper nouns capitalized. */
function asClause(s: string, properNouns: ReadonlySet<string>): string {
  const trimmed = s.trim().replace(/[.!?\s]+$/, "");
  const firstWord = trimmed.split(/\s+/)[0] ?? "";
  if (properNouns.has(firstWord) || firstWord === "I") return trimmed;
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

function properNounsOf(world: World): Set<string> {
  const names = new Set<string>();
  const add = (n: string) => {
    for (const w of n.split(/\s+/))
      if (/^[A-Z]/.test(w) && w !== "The") names.add(w.replace(/[^A-Za-z'-]/g, ""));
  };
  for (const n of world.npcs.named) add(n.name);
  for (const r of world.regions) add(r.name);
  for (const f of world.factions) add(f.name);
  add(world.meta.name);
  return names;
}

function fill(template: string, t: Thread, nouns: ReadonlySet<string>): string {
  const payoff = firstSentence(t.wovenAs?.payoffSummary ?? "Things came right in the end.");
  return template
    .replaceAll("{{deed}}", asClause(t.summary, nouns))
    .replaceAll("{{payoff}}", payoff.charAt(0).toUpperCase() + payoff.slice(1))
    .replaceAll("{{anchor}}", t.anchor?.name ?? "someone they once helped");
}

/**
 * The end-of-campaign reflection. Subtle by default: it hints that small
 * choices mattered, and never shows a number or names the mechanic.
 */
export function compileEpilogue(state: LoomState, world: World, style: EpilogueStyle, rng: Rng): string[] {
  if (style === "off") return [rng.pick(world.epilogue.closing)];
  const nouns = properNounsOf(world);

  // One line per moment that actually happened, told through its lead thread.
  const byMoment = new Map<string, Thread>();
  for (const t of state.threads) {
    if (t.state !== "woven" || !t.wovenAs || t.wovenAs.socket === "detour") continue;
    const current = byMoment.get(t.wovenAs.beatId);
    if (
      !current ||
      (t.wovenAs.lead && !current.wovenAs?.lead) ||
      (!current.wovenAs?.lead && t.weight > current.weight)
    ) {
      byMoment.set(t.wovenAs.beatId, t);
    }
  }
  const moments = [...byMoment.values()]
    .filter((t) => t.wovenAs?.socket !== "minor_grace")
    .sort((a, b) => (b.wovenTurn ?? 0) - (a.wovenTurn ?? 0))
    .slice(0, 3)
    .reverse();
  const echoes = state.threads
    .filter((t) => t.state !== "woven" && t.anchor?.name)
    .sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id))
    .slice(0, 1);

  const lines: string[] = [];
  const templates = style === "explicit" ? world.epilogue.explicit : world.epilogue.subtle;
  const withPlaceholders = templates.filter((tpl) => tpl.includes("{{"));
  const general = templates.filter((tpl) => !tpl.includes("{{"));
  moments.forEach((t, i) => {
    const tpl = withPlaceholders[i % Math.max(1, withPlaceholders.length)];
    if (tpl) lines.push(fill(tpl, t, nouns));
  });
  if (moments.length === 0 && general.length > 0) lines.push(rng.pick(general));
  for (const t of echoes) {
    const tpl = rng.pick(world.epilogue.echoes);
    lines.push(tpl.includes("{{") ? fill(tpl, t, nouns) : tpl);
  }
  lines.push(rng.pick(world.epilogue.closing));
  return lines;
}
