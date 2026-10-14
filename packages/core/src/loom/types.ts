import type { SceneKind } from "../story/vocab";
import type { AnchorKind, DeedTag, ShortcutTag, SnareEffect, SocketType, VirtueTag } from "./vocab";

/**
 * Hidden state of the loom (the "Swift Sure Hand"). None of this is ever shown
 * to players, and none of it is ever sent to the narrator.
 */

export interface AnchorRef {
  kind: AnchorKind;
  /** Named NPC id, campaign NPC id, item id, region/poi id, or faction id. */
  id: string;
  /** Display name, for epilogues and DM views. */
  name?: string;
  /** Tags of the anchor (e.g. "covets-ember", "lowly"). */
  tags?: string[];
  /** Faction the anchor belongs to, if any. */
  faction?: string;
}

/** What a deed cost the heroes. More cost means more weight. */
export interface CostEvidence {
  /** 0-3: how much benefit the heroes gave up (loot, an easy win, a reward). */
  forgoneBenefit?: number;
  hpSpent?: number;
  daysLost?: number;
  goldForgone?: number;
  itemGiven?: boolean;
  riskTaken?: boolean;
  /** Id of a shortcut that was on offer and declined. */
  shortcutDeclined?: string;
  /** The heroes expect a reward for this. Kindness for pay counts for less. */
  rewardExpected?: boolean;
}

export type DeedSource = "choice" | "intent" | "narrator" | "dm";

export interface DeedCandidate {
  tag: DeedTag;
  actorIds: string[];
  anchor: AnchorRef | null;
  evidence: CostEvidence;
  source: DeedSource;
  /** 0-1, how sure the classifier was. */
  confidence: number;
  /** Plain words for epilogues, e.g. "let Snibbet go free". */
  summary: string;
  /** For shortcut deeds that came from a world shortcut. */
  shortcutId?: string;
}

export interface Deed {
  id: string;
  turn: number;
  tag: DeedTag;
  actorIds: string[];
  anchor: AnchorRef | null;
  evidence: CostEvidence;
  source: DeedSource;
  weight: number;
  progress: number;
  chapter: number;
  summary: string;
  shortcutId?: string;
}

export type ThreadState = "dormant" | "ripening" | "ripe" | "reserved" | "woven" | "lapsed";

export interface Thread {
  id: string;
  deedId: string;
  tag: VirtueTag;
  actorIds: string[];
  anchor: AnchorRef | null;
  weight: number;
  /** Multiplier cut if the heroes later exploit the same target. */
  sincerity: number;
  plantedProgress: number;
  plantedTurn: number;
  ripenSpan: number;
  state: ThreadState;
  /** Kept for the final decisive moment. */
  reservedForBeat?: string;
  summary: string;
  wovenTurn?: number;
  wovenAs?: {
    beatId: string;
    socket: SocketType | "minor_grace" | "detour";
    payoffSummary: string;
    lead?: boolean;
  };
}

export type DueRule =
  | { kind: "crux" }
  | { kind: "anchor_reappears" }
  | { kind: "after_beats"; beats: number }
  | { kind: "chapter_end" };

export type SnareState = "latent" | "due" | "sprung" | "unknotted";

export interface Snare {
  id: string;
  deedId: string;
  shortcutId: string | null;
  tag: ShortcutTag;
  actorIds: string[];
  anchor: AnchorRef | null;
  severity: 1 | 2 | 3;
  due: DueRule;
  effect: SnareEffect;
  socket?: SocketType;
  faction?: string;
  hint: string;
  state: SnareState;
  createdTurn: number;
  createdProgress: number;
  createdChapter: number;
  sprungTurn?: number;
  summary: string;
}

export type DetourState = "planted" | "paid_off" | "repurposed" | "abandoned";

export interface DetourPlan {
  id: string;
  templateId: string;
  state: DetourState;
  target: { beatId: string; socket: SocketType };
  introduced: { kind: "npc" | "place" | "item"; name: string; archetype?: string; tags: string[] };
  plantedTurn: number;
  plantedProgress: number;
  plantedChapter: number;
  earliestPayoffProgress: number;
  deadlineChapter: number;
  payoffTurn?: number;
}

export type BearerPresence = "shadowing" | "elsewhere" | "ally_waiting";

export interface Bearer {
  npcId: string;
  name: string;
  threadIds: string[];
  mustSurvive: boolean;
  presence: BearerPresence;
  lastSeenTurn: number;
  /** Story progress at which the next glimpse may happen. */
  nextGlimpseProgress: number;
}

export interface Ledger {
  /** The hidden stat: total weight of threads this hero helped plant. */
  grace: number;
  /** Total severity of this hero's unpaid snares. */
  debt: number;
}

export interface LoomCounters {
  convergences: number;
  minorGraces: number;
  lastMinorGraceChapter: number | null;
  lastMinorGraceSceneId: string | null;
  lastDetourTurn: number | null;
  lastSnareSceneId: string | null;
  /** Turns on which a visible providence event happened, most recent last. */
  providenceTurns: number[];
  nextId: number;
}

export interface LoomState {
  deeds: Deed[];
  threads: Thread[];
  snares: Snare[];
  detours: DetourPlan[];
  bearers: Bearer[];
  ledgers: Record<string, Ledger>;
  counters: LoomCounters;
}

export function emptyLoomState(): LoomState {
  return {
    deeds: [],
    threads: [],
    snares: [],
    detours: [],
    bearers: [],
    ledgers: {},
    counters: {
      convergences: 0,
      minorGraces: 0,
      lastMinorGraceChapter: null,
      lastMinorGraceSceneId: null,
      lastDetourTurn: null,
      lastSnareSceneId: null,
      providenceTurns: [],
      nextId: 1,
    },
  };
}

// ------------------------------------------------------------- inputs

export type EntityStatus = "hostile" | "at_mercy" | "friendly" | "neutral";

export interface SceneEntity {
  ref: AnchorRef;
  status: EntityStatus;
  lowly: boolean;
  present: boolean;
}

/** What the loom knows about the scene being played. Built by the engine from game state. */
export interface SceneFacts {
  id: string;
  kind: SceneKind;
  beatId: string | null;
  regionId: string;
  terrain: string[];
  entities: SceneEntity[];
  /** Shortcut ids offered in this scene. */
  offeredShortcuts: string[];
  /** A lie would have helped the heroes here. */
  lieBenefit: boolean;
}

export interface StoryView {
  turn: number;
  progress: number;
  chapterNumber: number;
  actNumber: number;
  completedBeats: string[];
  /** The scene changed this turn (for detours and glimpses). */
  sceneChanged: boolean;
  /** A chapter finished this turn. */
  chapterEnded: boolean;
}

export type CheckFacts =
  | { kind: "crux"; beatId: string; success: boolean; margin: number; pSuccess: number }
  | { kind: "failure"; stakes: "low" | "moderate" | "high"; margin: number; characterIds: string[] };

export interface LoomInput {
  story: StoryView;
  scene: SceneFacts;
  deedCandidates: DeedCandidate[];
  /** Promises fulfilled this turn (by npc or anchor id). */
  promisesKept: string[];
  check: CheckFacts | null;
  /** Heroes who just dropped to 0 hit points. */
  heroesDowned: string[];
  partyDown: boolean;
}

// ------------------------------------------------------------ outputs

/** What the narrator is told. In-world words only. Never numbers, never reasons. */
export type NarrativeDirective =
  | {
      kind: "convergence";
      outcome: "success_by_convergence" | "costly_success";
      socket: SocketType;
      agentName: string | null;
      text: string;
      mustNot: string[];
    }
  | { kind: "fail_forward"; text: string; mustNot: string[] }
  | { kind: "minor_grace"; text: string; mustNot: string[] }
  | {
      kind: "detour_setup";
      text: string;
      introduce: { kind: "npc" | "place" | "item"; name: string };
      mustNot: string[];
    }
  | { kind: "detour_payoff"; text: string; mustNot: string[] }
  | { kind: "bearer_glimpse"; text: string; mustNot: string[] }
  | { kind: "snare_springs"; effect: SnareEffect; text: string; mustNot: string[] };

/** What the story director must respect. Reasons are never included. */
export type DirectorConstraint =
  | { kind: "keep_alive"; npcId: string }
  | { kind: "schedule_presence"; npcId: string; nearBeatId: string; mode: BearerPresence }
  | { kind: "need_socket"; beatId: string; socket: SocketType; detourId: string }
  | { kind: "snare_hook"; anchor: AnchorRef | null; effect: SnareEffect }
  | { kind: "tempt"; intensity: 1 | 2 };

/** Mechanical consequences the engine applies. */
export type RuleEffect =
  | { kind: "disadvantage_next_roll"; characterIds: string[] }
  | { kind: "faction_disposition"; factionId: string; delta: number }
  | { kind: "route_blocked"; regionId: string }
  | { kind: "hero_rallies"; characterId: string }
  | { kind: "failure_softened" };

export type CruxOutcome = "success" | "success_by_convergence" | "costly_success" | "fail_forward";

export interface CruxResolution {
  beatId: string;
  outcome: CruxOutcome;
  available: number;
  required: number;
  wovenThreadIds: string[];
  socket: SocketType | null;
  withheldSockets: SocketType[];
}

export interface AuditEntry {
  step: string;
  detail: string;
}

export interface LoomResult {
  state: LoomState;
  directives: NarrativeDirective[];
  constraints: DirectorConstraint[];
  effects: RuleEffect[];
  crux: CruxResolution | null;
  audit: AuditEntry[];
}

export interface PlainDirectiveMeta {
  shortcut?: ShortcutTag;
}
