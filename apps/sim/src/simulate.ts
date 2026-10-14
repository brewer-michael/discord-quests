import {
  type AnchorRef,
  bearersForScene,
  compileEpilogue,
  type DeedCandidate,
  emptyLoomState,
  evaluateLoom,
  type LoomInput,
  type LoomTuning,
  loomContext,
  type SceneEntity,
  snarePressure,
} from "@dq/core/loom";
import { deriveRng } from "@dq/core/rng";
import { proficiencyBonus, rollD20, successProbability } from "@dq/core/rules";
import { type ClockState, chapterComplete, clockKey, cruxDc, storyProgress, tickClock } from "@dq/core/story";
import type { BeatRef, WorldIndex } from "@dq/core/world";

export const POLICIES = ["merciful", "mixed", "shortcut", "random"] as const;
export type Policy = (typeof POLICIES)[number];

/** How often each style of player takes a virtue opportunity or a shortcut. */
const STYLE: Record<Policy, { virtue: number; shortcut: number }> = {
  merciful: { virtue: 0.95, shortcut: 0.03 },
  mixed: { virtue: 0.5, shortcut: 0.4 },
  shortcut: { virtue: 0.05, shortcut: 0.9 },
  random: { virtue: 0.3, shortcut: 0.5 },
};

export interface CruxRecord {
  beatId: string;
  dc: number;
  pSuccess: number;
  outcome: string;
  socket: string | null;
  withheld: string[];
}

export interface SimRun {
  policy: Policy;
  seed: string;
  turns: number;
  cruxes: CruxRecord[];
  minorGraces: number;
  detours: { planted: number; paidOff: number; repurposed: number; open: number };
  /** Most optional providence events (graces, new detours) in any 10-turn window. */
  maxOptionalIn10: number;
  snibbetPresentAtFinale: boolean;
  threadsPlanted: number;
  snaresTied: number;
  epilogue: string[];
  transcript: string[];
}

export interface SimOptions {
  policy: Policy;
  seed: string;
  tuning?: Partial<LoomTuning>;
  transcript?: boolean;
}

const PARTY = ["hero-a", "hero-b", "hero-c"];

function anchorFor(index: WorldIndex, npcId: string): AnchorRef {
  const npc = index.namedNpcs.get(npcId);
  return {
    kind: "npc",
    id: npcId,
    name: npc?.name ?? npcId,
    tags: npc?.tags ?? [],
    ...(npc?.faction ? { faction: npc.faction } : {}),
  };
}

/** "Let Snibbet go, speak up for him, or ..." becomes "let Snibbet go". */
function firstClause(note: string): string {
  const clause = (note.split(/,| or |\. /)[0] ?? note).trim().replace(/[.!]$/, "");
  return clause.charAt(0).toLowerCase() + clause.slice(1);
}

function abilityModAt(level: number): number {
  if (level >= 8) return 5;
  if (level >= 4) return 4;
  return 3;
}

export function simulateCampaign(index: WorldIndex, opts: SimOptions): SimRun {
  const ctx = loomContext(index, opts.tuning ?? {});
  const style = STYLE[opts.policy];
  const log: string[] = [];
  const say = (line: string) => {
    if (opts.transcript) log.push(line);
  };

  let state = emptyLoomState();
  let clocks: ClockState = {};
  const completed: string[] = [];
  let turn = 0;
  let level = index.world.meta.startingLevel;
  let regionId = index.world.meta.startRegion;
  const cruxes: CruxRecord[] = [];
  const optionalTurns: number[] = [];
  let snibbetPresentAtFinale = false;
  const finaleId = [...index.beatOrder].reverse().find((b) => b.beat.decisive)?.beat.id;

  const step = (
    ref: BeatRef | null,
    scene: LoomInput["scene"],
    deeds: DeedCandidate[],
    extra: Partial<LoomInput>,
    chapterEnded: boolean,
  ) => {
    turn += 1;
    const input: LoomInput = {
      story: {
        turn,
        progress: storyProgress(index, completed),
        chapterNumber: ref?.chapter.number ?? 1,
        actNumber: ref?.act.number ?? 1,
        completedBeats: [...completed],
        sceneChanged: true,
        chapterEnded,
      },
      scene,
      deedCandidates: deeds,
      promisesKept: extra.promisesKept ?? [],
      check: extra.check ?? null,
      heroesDowned: extra.heroesDowned ?? [],
      partyDown: false,
    };
    const out = evaluateLoom(state, input, ctx, deriveRng(opts.seed, "loom", turn));
    state = out.state;
    for (const d of out.directives) {
      if (d.kind === "minor_grace" || d.kind === "detour_setup") optionalTurns.push(turn);
      say(`    [${d.kind}] ${d.text}`);
    }
    return out;
  };

  const branches = new Set<string>();
  for (const ref of index.beatOrder) {
    const beat = ref.beat;
    if (beat.branch && !branches.has(beat.id)) continue;
    const region = index.regions.get(beat.region);

    // Traveling to a new region is its own scene, where quiet-hand detours can happen.
    if (beat.region !== regionId) {
      say(`  ~ travel from ${index.regions.get(regionId)?.name} to ${region?.name}`);
      step(
        ref,
        {
          id: `travel-${turn}`,
          kind: "travel",
          beatId: null,
          regionId: beat.region,
          terrain: region?.terrain ?? [],
          entities: [],
          offeredShortcuts: [],
          lieBenefit: false,
        },
        [],
        {},
        false,
      );
      regionId = beat.region;
    }

    const rules = deriveRng(opts.seed, "rules", turn + 1);
    const choices = deriveRng(opts.seed, "story", turn + 1);
    say(`${ref.chapter.number}. ${beat.title} (${beat.kind})`);

    // Who is in the scene.
    const entities: SceneEntity[] = [];
    const add = (npcId: string, status: SceneEntity["status"]) => {
      const a = anchorFor(index, npcId);
      const existing = entities.find((e) => e.ref.id === npcId);
      if (existing) {
        if (status === "at_mercy") existing.status = status;
        return;
      }
      entities.push({ ref: a, status, lowly: (a.tags ?? []).includes("lowly"), present: true });
    };
    for (const id of beat.introduces) add(id, "neutral");
    for (const v of beat.virtueOpportunities)
      if (v.target) add(v.target, v.tag === "mercy" ? "at_mercy" : "neutral");
    if (beat.decisive) for (const id of bearersForScene(state, beat.id)) add(id, "neutral");
    if (beat.id === finaleId) snibbetPresentAtFinale = entities.some((e) => e.ref.id === "snibbet");

    // What the players choose.
    const deeds: DeedCandidate[] = [];
    const promisesKept: string[] = [];
    for (const v of beat.virtueOpportunities) {
      if (!choices.chance(style.virtue)) continue;
      const anchor = v.target ? anchorFor(index, v.target) : null;
      if (v.tag === "promise_kept" && anchor) promisesKept.push(anchor.id);
      deeds.push({
        tag: v.tag,
        actorIds: [choices.pick(PARTY)],
        anchor,
        evidence:
          v.tag === "mercy"
            ? { forgoneBenefit: 2 }
            : v.tag === "kindness_to_lowly"
              ? { forgoneBenefit: 1, daysLost: beat.offersShortcuts.length > 0 ? 1 : 0 }
              : v.tag === "self_sacrifice"
                ? { hpSpent: 3 }
                : { forgoneBenefit: 1 },
        source: "choice",
        confidence: 1,
        summary: firstClause(v.note),
      });
    }
    let tookShortcut = false;
    for (const sid of beat.offersShortcuts) {
      const def = index.shortcuts.get(sid);
      if (!def || (def.minChapter ?? 1) > ref.chapter.number) continue;
      if (choices.chance(style.shortcut)) {
        tookShortcut = true;
        deeds.push({
          tag: def.tag,
          actorIds: [choices.pick(PARTY)],
          anchor: def.offeredBy.kind === "npc" ? anchorFor(index, def.offeredBy.id) : null,
          evidence: {},
          source: "choice",
          confidence: 1,
          summary: `took ${def.name}`,
          shortcutId: sid,
        });
        say(`  - took the shortcut: ${def.name}`);
      }
    }
    if (!tookShortcut && beat.offersShortcuts.length > 0) {
      const declined = beat.offersShortcuts[0] as string;
      if (!deeds.some((d) => d.tag === "patience")) {
        deeds.push({
          tag: "patience",
          actorIds: PARTY,
          anchor: null,
          evidence: { shortcutDeclined: declined, daysLost: 1 },
          source: "choice",
          confidence: 1,
          summary: "chose the long way instead of the quick one",
        });
      }
      if (beat.offersShortcuts.some((s) => index.shortcuts.get(s)?.price.kind === "keepsake")) {
        deeds.push({
          tag: "keepsake_kept",
          actorIds: PARTY,
          anchor: null,
          evidence: { forgoneBenefit: 1 },
          source: "choice",
          confidence: 1,
          summary: "kept a keepsake from home instead of trading it away",
        });
      }
    }
    const printed = new Set<string>();
    for (const d of deeds) {
      if (d.shortcutId || printed.has(d.tag)) continue;
      printed.add(d.tag);
      say(`  - ${d.tag}: ${d.summary}`);
    }

    // Rolls.
    let check: LoomInput["check"] = null;
    let heroesDowned: string[] = [];
    let dc = 0;
    let pSuccess = 1;
    if (beat.crux) {
      const mod =
        abilityModAt(level) +
        (beat.crux.check.skill ? proficiencyBonus(level) : Math.floor(proficiencyBonus(level) / 2));
      dc = cruxDc(beat.crux, clocks, snarePressure(state));
      pSuccess = successProbability(mod, dc, "advantage");
      const roll = rollD20(rules, "advantage");
      const total = roll.natural + mod;
      check = { kind: "crux", beatId: beat.id, success: total >= dc, margin: total - dc, pSuccess };
      say(`  * crux ${beat.crux.check.label}: rolled ${total} vs ${dc} (p=${pSuccess.toFixed(2)})`);
    } else if (rules.chance(0.25)) {
      check = {
        kind: "failure",
        stakes: "moderate",
        margin: -rules.int(1, 5),
        characterIds: [rules.pick(PARTY)],
      };
    }
    if (beat.kind === "combat" && rules.chance(0.2)) heroesDowned = [rules.pick(PARTY)];

    const done = new Set([...completed, beat.id]);
    const chapterEnded = chapterComplete(index, ref.chapter.id, done);
    const sceneEntities = entities;
    const out = step(
      ref,
      {
        id: `beat-${beat.id}`,
        kind: beat.kind,
        beatId: beat.id,
        regionId: beat.region,
        terrain: region?.terrain ?? [],
        entities: sceneEntities,
        offeredShortcuts: beat.offersShortcuts,
        lieBenefit: false,
      },
      deeds,
      { check, heroesDowned, promisesKept },
      chapterEnded,
    );

    if (out.crux && beat.crux) {
      cruxes.push({
        beatId: beat.id,
        dc,
        pSuccess,
        outcome: out.crux.outcome,
        socket: out.crux.socket,
        withheld: out.crux.withheldSockets,
      });
      say(`  => ${out.crux.outcome}${out.crux.socket ? ` via ${out.crux.socket}` : ""}`);
      if (out.crux.outcome === "fail_forward" && beat.crux.clock) {
        clocks = tickClock(index, clocks, clockKey(beat.crux.clock.faction, beat.crux.clock.clock), 1);
      }
      if (out.crux.outcome === "fail_forward" && beat.crux.onFailForward.beat)
        branches.add(beat.crux.onFailForward.beat);
    }

    completed.push(beat.id);
    if (beat.milestone) level = Math.min(index.world.meta.maxLevel, level + 1);
    if (chapterEnded) {
      clocks = tickClock(index, clocks, clockKey("gloam-host", "long-night"), 1);
      if (ref.act.number >= 2) clocks = tickClock(index, clocks, clockKey("gloam-host", "ember-dims"), 1);
    }
  }

  let maxOptionalIn10 = 0;
  for (const t of optionalTurns) {
    maxOptionalIn10 = Math.max(maxOptionalIn10, optionalTurns.filter((u) => u > t - 10 && u <= t).length);
  }
  const epilogue = compileEpilogue(state, index.world, "subtle", deriveRng(opts.seed, "flavor", 0));
  for (const line of epilogue) say(`  ${line}`);

  return {
    policy: opts.policy,
    seed: opts.seed,
    turns: turn,
    cruxes,
    minorGraces: state.counters.minorGraces,
    detours: {
      planted: state.detours.length,
      paidOff: state.detours.filter((d) => d.state === "paid_off").length,
      repurposed: state.detours.filter((d) => d.state === "repurposed").length,
      open: state.detours.filter((d) => d.state === "planted").length,
    },
    maxOptionalIn10,
    snibbetPresentAtFinale,
    threadsPlanted: state.threads.length,
    snaresTied: state.snares.length,
    epilogue,
    transcript: log,
  };
}
