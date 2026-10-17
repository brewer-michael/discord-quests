import {
  type AnchorRef,
  bearersForScene,
  compileEpilogue,
  type DeedCandidate,
  emptyLoomState,
  evaluateLoom,
  type LoomInput,
  type LoomMoment,
  type LoomTuning,
  loomContext,
  type SceneEntity,
  snarePressure,
} from "@dq/core/loom";
import { deriveRng } from "@dq/core/rng";
import { proficiencyBonus, rollD20, successProbability } from "@dq/core/rules";
import {
  cruxDc,
  expectedProgress,
  finaleAllowed,
  planFromSeed,
  type StoryLength,
  storyProgress,
} from "@dq/core/story";
import type { SeedDef, SituationDef, WorldIndex } from "@dq/core/world";

/** The story the simulator plays unless told otherwise: the one the hidden hand's world data was tuned on. */
export const DEFAULT_SEED = "the-dimming";

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
  momentId: string;
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
  /** Which of the world's story seeds to play. */
  seedId?: string;
  length?: StoryLength;
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

/**
 * Plays a campaign the way the living story does, without an AI: the seed's set pieces as scenes (each once),
 * a journey whenever the heroes change region, and each decisive moment when the story has come far enough for
 * it, the finale last. Threats move on with time and with every decisive moment that goes badly.
 */
export function simulateCampaign(index: WorldIndex, opts: SimOptions): SimRun {
  const seed = index.seeds.get(opts.seedId ?? DEFAULT_SEED) ?? ([...index.seeds.values()][0] as SeedDef);
  const plan = planFromSeed(seed, opts.length ?? "standard");
  const at = expectedProgress(plan);
  const moments: LoomMoment[] = plan.moments.map((m) => ({
    id: m.id,
    title: m.title,
    placeName: index.regions.get(m.regionId ?? "")?.name ?? "the place ahead",
    sockets: m.crux.sockets,
    requiredGrace: m.crux.requiredGrace,
    onSuccess: m.crux.onSuccess,
    onCostlySuccess: m.crux.onCostlySuccess,
    onFailForward: m.crux.onFailForward,
    finale: m.finale,
    at: at.get(m.id) ?? 0,
    done: false,
  }));
  const ctx = loomContext(index, moments, opts.tuning ?? {});
  const style = STYLE[opts.policy];
  const log: string[] = [];
  const say = (line: string) => {
    if (opts.transcript) log.push(line);
  };

  let state = emptyLoomState();
  const done: string[] = [];
  let turn = 0;
  let scenesDone = 0;
  let milestones = 0;
  let chapter = 1;
  let level = index.world.meta.startingLevel;
  let regionId = seed.startRegions[0] ?? index.world.meta.startRegion;
  const cruxes: CruxRecord[] = [];
  const optionalTurns: number[] = [];
  let snibbetPresentAtFinale = false;
  const front = plan.fronts.find((f) => f.central) ?? plan.fronts[0];
  const queue: SituationDef[] = [
    ...seed.situations.flatMap((id) => index.situations.get(id) ?? []),
    ...[...index.situations.values()].filter((x) => !seed.situations.includes(x.id)),
  ];

  const step = (
    scene: LoomInput["scene"],
    deeds: DeedCandidate[],
    extra: Partial<LoomInput>,
    chapterEnded: boolean,
  ) => {
    turn += 1;
    const input: LoomInput = {
      story: {
        turn,
        progress: storyProgress(scenesDone, milestones),
        chapterNumber: chapter,
        doneMoments: [...done],
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

  // Journeys are scenes of their own, where quiet-hand detours can happen.
  const travelTo = (to: string) => {
    if (to === regionId) return;
    const region = index.regions.get(to);
    say(`  ~ travel from ${index.regions.get(regionId)?.name} to ${region?.name}`);
    step(
      {
        id: `travel-${turn}`,
        kind: "travel",
        momentId: null,
        regionId: to,
        terrain: region?.terrain ?? [],
        entities: [],
        offeredShortcuts: [],
        lieBenefit: false,
      },
      [],
      {},
      false,
    );
    scenesDone += 1;
    regionId = to;
  };

  while (done.length < plan.moments.length && turn < 400) {
    const progress = storyProgress(scenesDone, milestones);
    const moment = plan.moments.find((m) => !done.includes(m.id));
    const due =
      moment &&
      (moment.finale
        ? finaleAllowed(scenesDone, plan.length) && progress >= (at.get(moment.id) ?? 0) - 2
        : progress >= (at.get(moment.id) ?? 0));
    const situation = due ? undefined : queue.shift();
    const rules = deriveRng(opts.seed, "rules", turn + 1);
    const choices = deriveRng(opts.seed, "story", turn + 1);

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

    if (moment && (due || !situation)) {
      // A decisive moment: the heroes' own effort, and whatever their earlier deeds bring to it.
      travelTo(moment.regionId ?? regionId);
      say(`${chapter}. ${moment.title} (decisive)`);
      for (const id of bearersForScene(state, moment.id)) add(id, "neutral");
      if (moment.finale) snibbetPresentAtFinale = entities.some((e) => e.ref.id === "snibbet");
      const mod =
        abilityModAt(level) +
        (moment.crux.check.skill ? proficiencyBonus(level) : Math.floor(proficiencyBonus(level) / 2));
      const dc = cruxDc(moment.crux, front?.stage ?? 0, snarePressure(state));
      const pSuccess = successProbability(mod, dc, "advantage");
      const roll = rollD20(rules, "advantage");
      const total = roll.natural + mod;
      say(`  * crux ${moment.crux.check.label}: rolled ${total} vs ${dc} (p=${pSuccess.toFixed(2)})`);
      const out = step(
        {
          id: `moment-${moment.id}`,
          kind: "crux",
          momentId: moment.id,
          regionId,
          terrain: index.regions.get(regionId)?.terrain ?? [],
          entities,
          offeredShortcuts: [],
          lieBenefit: false,
        },
        [],
        { check: { kind: "crux", momentId: moment.id, success: total >= dc, margin: total - dc, pSuccess } },
        true,
      );
      if (out.crux) {
        cruxes.push({
          momentId: moment.id,
          dc,
          pSuccess,
          outcome: out.crux.outcome,
          socket: out.crux.socket,
          withheld: out.crux.withheldSockets,
        });
        say(`  => ${out.crux.outcome}${out.crux.socket ? ` via ${out.crux.socket}` : ""}`);
        if (out.crux.outcome === "fail_forward" && front) front.stage += 1;
      }
      done.push(moment.id);
      scenesDone += 1;
      milestones += 1;
      chapter += 1;
      level = Math.min(index.world.meta.maxLevel, level + 1);
      continue;
    }
    if (!situation) break;

    travelTo(situation.region);
    say(`${chapter}. ${situation.title} (${situation.kind})`);
    for (const id of situation.introduces) add(id, "neutral");
    for (const v of situation.virtueOpportunities)
      if (v.target) add(v.target, v.tag === "mercy" ? "at_mercy" : "neutral");

    // What the players choose.
    const deeds: DeedCandidate[] = [];
    const promisesKept: string[] = [];
    for (const v of situation.virtueOpportunities) {
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
              ? { forgoneBenefit: 1, daysLost: situation.offersShortcuts.length > 0 ? 1 : 0 }
              : v.tag === "self_sacrifice"
                ? { hpSpent: 3 }
                : { forgoneBenefit: 1 },
        source: "choice",
        confidence: 1,
        summary: firstClause(v.note),
      });
    }
    const offered = situation.offersShortcuts.filter(
      (sid) => (index.shortcuts.get(sid)?.minChapter ?? 1) <= chapter,
    );
    let tookShortcut = false;
    for (const sid of offered) {
      const def = index.shortcuts.get(sid);
      if (!def || !choices.chance(style.shortcut)) continue;
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
    if (!tookShortcut && offered.length > 0) {
      deeds.push({
        tag: "patience",
        actorIds: PARTY,
        anchor: null,
        evidence: { shortcutDeclined: offered[0] as string, daysLost: 1 },
        source: "choice",
        confidence: 1,
        summary: "chose the long way instead of the quick one",
      });
      if (offered.some((sid) => index.shortcuts.get(sid)?.price.kind === "keepsake"))
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
    const printed = new Set<string>();
    for (const d of deeds) {
      if (d.shortcutId || printed.has(d.tag)) continue;
      printed.add(d.tag);
      say(`  - ${d.tag}: ${d.summary}`);
    }

    const check: LoomInput["check"] = rules.chance(0.25)
      ? { kind: "failure", stakes: "moderate", margin: -rules.int(1, 5), characterIds: [rules.pick(PARTY)] }
      : null;
    const heroesDowned = situation.kind === "combat" && rules.chance(0.2) ? [rules.pick(PARTY)] : [];
    step(
      {
        id: `scene-${situation.id}`,
        kind: situation.kind,
        momentId: null,
        regionId: situation.region,
        terrain: index.regions.get(situation.region)?.terrain ?? [],
        entities,
        offeredShortcuts: offered,
        lieBenefit: false,
      },
      deeds,
      { check, heroesDowned, promisesKept },
      false,
    );
    scenesDone += 1;
    // Threats move on with time.
    if (front && scenesDone % 4 === 0 && front.stage < front.portents.length) front.stage += 1;
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
