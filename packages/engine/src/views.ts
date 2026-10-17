import type { NarratorOutput, PublicSceneData, SceneSpecView } from "@dq/core/narration";
import type { ImageBrief } from "@dq/core/safety";
import type { StoryPlan } from "@dq/core/story";
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
  /** Hit points it took, when it was an attack that landed or grazed. */
  damage?: number;
  /** A miss close enough to graze, under partial hits. */
  graze?: boolean;
  /** The dice of the miss that Courage rerolled, under partial hits. */
  rerolled?: number[];
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
  promisesKept: string[];
  /**
   * The story plan as this turn leaves it, before the storyteller's changes: the scene that ended recorded, the
   * threats moved, the next scene's people in it. Null when the campaign has no plan yet.
   */
  plan: StoryPlan | null;
  /** The scene that ended settled something big: the heroes level up. */
  milestone: boolean;
  /** A new chapter's title, when this turn begins one. */
  chapterTitle: string | null;
  /** The chapter this turn ends (a new one begins, or the story does), for its recap. */
  endedChapter: { number: number; title: string } | null;
  /** What the heroes chose this turn, for the director. */
  heading: string[];
  /** The scene this turn ends, turn by turn, with how it ended, for the director. */
  endedLog: string[];
  /** When the director couldn't frame the next scene: where the story could go, for the person telling it. */
  options: string[];
  view: PublicSceneData;
  choicesFor: SceneSpecView;
  narration: NarratorOutput;
  /**
   * Why the AI storyteller couldn't finish this turn, when it couldn't. Then a person in the DM room tells it,
   * and the narration above is empty until they do.
   */
  handoff: string[] | null;
  /** Results of a fight round, applied on commit. */
  combat: {
    heroes: Array<{ id: string; hp: number; tempHp: number; conditions: string[] }>;
    usedItems: Array<{ heroId: string; itemId: string }>;
    usedSlots: Array<{ heroId: string; level: number }>;
    log: string[];
    outcome: "ongoing" | "victory" | "party_down";
  } | null;
}

/**
 * What a person needs to tell a turn the AI storyteller couldn't: why it couldn't, the scene and where the
 * story goes next, and what's already been decided. The heroes' actions and the dice are in the draft itself.
 */
export interface DraftHandoff {
  reasons: string[];
  scene: SceneBrief;
  /** The scene this turn moves the story to, when it closes this one. */
  next: SceneBrief | null;
  /** Settled already: the fight, the decisive moment, what may be found, how the adventure ends. */
  decisions: string[];
  /** When the next scene couldn't be framed: where the story could go from here. */
  options: string[];
}

export interface SceneBrief {
  title: string;
  summary: string;
  /** The question the scene turns on. */
  question: string;
}

/** What the human DM sees before a turn goes out: an Assist-mode draft, or a turn handed over. */
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
  /** Set when the AI storyteller couldn't finish the turn and a person has to tell it. */
  handoff: DraftHandoff | null;
}

export type ResolveResult = { kind: "turn"; view: TurnView } | { kind: "draft"; draft: DmDraft };
