import type { ImageBrief } from "@dq/core/safety";

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
