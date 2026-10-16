import type { NarratorOutput, PublicSceneData, SceneSpecView } from "@dq/core/narration";
import type { ImageBrief } from "@dq/core/safety";
import type { CombatView } from "./combat";
import type { SceneSpec } from "./director";

/** Everything the Discord bot needs to render a turn. No hidden state. */
export interface TurnView {
  campaignId: string;
  seq: number;
  sceneTitle: string;
  sceneKind: string;
  locationName: string;
  regionId: string;
  narration: string;
  npcLines: Array<{ name: string; line: string }>;
  rolls: RollView[];
  choices: Array<{ index: number; label: string }>;
  /** The round players act in next. Null when the campaign has ended. */
  roundId: string | null;
  sceneChanged: boolean;
  imageBrief: ImageBrief | null;
  levelUps: Array<{ characterId: string; userId: string; name: string; toLevel: number }>;
  campaignEnded: boolean;
  /** True when the narrator was unavailable and the engine told the turn itself. */
  fallback: boolean;
  /** The fight in this scene, if any. When it's on, players pick battle actions instead of choices. */
  combat: CombatView | null;
}

export interface RollView {
  characterName: string;
  label: string;
  natural: number;
  rolls: number[];
  modifier: number;
  total: number;
  difficulty: string;
  success: boolean;
  mode: "normal" | "advantage" | "disadvantage";
  /** Hit points it took, when it was an attack that landed. */
  damage?: number;
  /** A foe's attack on a hero, rather than a hero's roll. */
  foe?: boolean;
}

export interface CharacterSheetView {
  id: string;
  userId: string;
  name: string;
  look: string;
  className: string;
  pathName: string;
  speciesName: string;
  backgroundName: string;
  level: number;
  xpNote: string;
  hp: number;
  hpMax: number;
  armorClass: number;
  speed: number;
  abilities: Record<string, { score: number; modifier: number }>;
  proficiencyBonus: number;
  skills: Array<{ name: string; modifier: number; proficient: boolean; expertise: boolean }>;
  savingThrows: Record<string, number>;
  conditions: string[];
  inventory: Array<{ name: string; qty: number; equipped: boolean }>;
  gold: number;
  keepsake: string | null;
  spellSlots: number[];
  features: string[];
  perks: string[];
  pendingLevelUp: boolean;
}

export type SubmitResult =
  | { ok: true; allSubmitted: boolean; waitingOn: string[] }
  | { ok: true; deflection: string }
  | { ok: false; message: string };

/** A resolved round before it is committed. Public data only (the hidden part lives in the loom schema). */
export interface PreparedTurn {
  campaignId: string;
  roundId: string;
  roundN: number;
  sceneId: string;
  seq: number;
  closing: boolean;
  mode: "opening" | "continue" | "close_and_open" | "finale";
  spec: SceneSpec;
  nextSpec: SceneSpec | null;
  actions: Array<{ characterId: string; summary: string; passed: boolean; makesPromiseTo: string | null }>;
  rolls: RollView[];
  cruxLabel: string | null;
  cruxSuccess: boolean | null;
  chapterEnded: boolean;
  completedAfter: string[];
  /** Branch beats open after this turn. */
  branchesAfter: string[];
  promisesKept: string[];
  view: PublicSceneData;
  choicesFor: SceneSpecView;
  narration: NarratorOutput;
  fallback: boolean;
  /** Results of a fight round, applied on commit. */
  combat: {
    heroes: Array<{ id: string; hp: number; tempHp: number; conditions: string[] }>;
    usedItems: Array<{ heroId: string; itemId: string }>;
    usedSlots: Array<{ heroId: string; level: number }>;
    log: string[];
    outcome: "ongoing" | "victory" | "party_down";
  } | null;
}

/** What the human DM sees before a turn goes out in Assist mode. */
export interface DmDraft {
  approvalId: string;
  campaignId: string;
  seq: number;
  sceneTitle: string;
  narration: string;
  npcLines: string[];
  rolls: RollView[];
  choices: string[];
  actions: string[];
  /** Spoilers for the DM only: what the hidden hand is doing this turn. */
  dmNotes: string[];
  fallback: boolean;
}

export type ResolveResult = { kind: "turn"; view: TurnView } | { kind: "draft"; draft: DmDraft };
