/**
 * Button, select and modal ids. Ids carry only public references (round,
 * campaign, character ids and a small action); hidden story data never goes in
 * an id. Discord limits custom ids to 100 characters.
 */
export type CustomId =
  | { kind: "choice"; roundId: string; index: number }
  | { kind: "freeform"; roundId: string }
  | { kind: "freeform-modal"; roundId: string }
  | { kind: "pass"; roundId: string }
  | { kind: "resolve"; roundId: string }
  | { kind: "sheet"; campaignId: string }
  | { kind: "map"; campaignId: string }
  | { kind: "map-focus"; campaignId: string }
  | { kind: "xcard"; campaignId: string }
  | { kind: "join"; campaignId: string }
  | { kind: "create"; campaignId: string }
  | { kind: "start"; campaignId: string }
  | { kind: "wizard"; campaignId: string; page: number; action: string }
  | { kind: "wizard-name"; campaignId: string }
  | { kind: "levelup"; characterId: string }
  | { kind: "approval"; approvalId: string; action: ApprovalAction }
  | { kind: "approval-modal"; approvalId: string; action: ApprovalAction }
  | { kind: "battle"; roundId: string; action: BattleAction }
  | { kind: "battle-pick"; roundId: string; action: BattleAction; arg?: string }
  /** A page of the picture gallery. The search words ride along (see pictureSearchWords). */
  | { kind: "gallery"; campaignId: string; index: number; words: string[] }
  | { kind: "gallery-share"; campaignId: string; sceneId: string }
  /** The story settings card: a select (intensity, voice, humor, art) or a button (wishes, done). */
  | { kind: "story"; campaignId: string; action: StoryAction }
  | { kind: "story-modal"; campaignId: string }
  /** The DM room's card: pick a turn to rewind to and confirm, mend the party, rebuild the fight, or switch partial hits. */
  | { kind: "rewind"; campaignId: string; action: RewindAction; seq?: number }
  /** Another go at a story-writer job that was given up on, from its notice in the DM room. */
  | { kind: "writer-retry"; jobId: string };

export type RewindAction = "pick" | "go" | "back" | "mend" | "rebuild" | "cancel" | "graze-on" | "graze-off";
const REWIND_ACTIONS: readonly string[] = [
  "pick",
  "go",
  "back",
  "mend",
  "rebuild",
  "cancel",
  "graze-on",
  "graze-off",
];

export type StoryAction = "intensity" | "voice" | "humor" | "art" | "wishes" | "done";
const STORY_ACTIONS: readonly string[] = ["intensity", "voice", "humor", "art", "wishes", "done"];

/** The battle buttons. Picks carry a spell or item id when a second choice is needed. */
export type BattleAction = "attack" | "magic" | "defend" | "help" | "potion" | "spare";
const BATTLE_ACTIONS: readonly string[] = ["attack", "magic", "defend", "help", "potion", "spare"];
const ARG = /^[a-z0-9-]{1,40}$/;
const WORD = /^[a-z0-9]{1,20}$/;

export type ApprovalAction = "ok" | "edit" | "redo" | "write";
const APPROVAL_ACTIONS: readonly string[] = ["ok", "edit", "redo", "write"];

const CODES: Record<CustomId["kind"], string> = {
  choice: "ch",
  freeform: "ff",
  "freeform-modal": "ffm",
  pass: "ps",
  resolve: "rs",
  sheet: "sh",
  map: "mp",
  "map-focus": "mpf",
  xcard: "xc",
  join: "jn",
  create: "cr",
  start: "st",
  wizard: "wz",
  "wizard-name": "wzn",
  levelup: "lv",
  approval: "ap",
  "approval-modal": "apm",
  battle: "bt",
  "battle-pick": "bp",
  gallery: "gl",
  "gallery-share": "gls",
  story: "sty",
  "story-modal": "stm",
  rewind: "rw",
  "writer-retry": "wrr",
};
const KINDS = Object.fromEntries(Object.entries(CODES).map(([k, v]) => [v, k])) as Record<
  string,
  CustomId["kind"]
>;

export function encodeId(id: CustomId): string {
  const parts: Array<string | number> = ["dq", CODES[id.kind]];
  switch (id.kind) {
    case "choice":
      parts.push(id.roundId, id.index);
      break;
    case "freeform":
    case "freeform-modal":
    case "pass":
    case "resolve":
      parts.push(id.roundId);
      break;
    case "wizard":
      parts.push(id.campaignId, id.page, id.action);
      break;
    case "levelup":
      parts.push(id.characterId);
      break;
    case "approval":
    case "approval-modal":
      parts.push(id.approvalId, id.action);
      break;
    case "battle":
      parts.push(id.roundId, id.action);
      break;
    case "battle-pick":
      parts.push(id.roundId, id.action);
      if (id.arg) parts.push(id.arg);
      break;
    case "gallery":
      parts.push(id.campaignId, id.index, id.words.join("+"));
      break;
    case "gallery-share":
      parts.push(id.campaignId, id.sceneId);
      break;
    case "story":
      parts.push(id.campaignId, id.action);
      break;
    case "rewind":
      parts.push(id.campaignId, id.action);
      if (id.seq !== undefined) parts.push(id.seq);
      break;
    case "writer-retry":
      parts.push(id.jobId);
      break;
    default:
      parts.push(id.campaignId);
  }
  const out = parts.join(":");
  if (out.length > 100) throw new Error(`custom id too long: ${out}`);
  return out;
}

const UUID = /^[0-9a-f-]{36}$/;

export function decodeId(raw: string): CustomId | null {
  const parts = raw.split(":");
  if (parts[0] !== "dq") return null;
  const kind = KINDS[parts[1] ?? ""];
  if (!kind) return null;
  const a = parts[2] ?? "";
  if (!UUID.test(a)) return null;
  switch (kind) {
    case "choice": {
      const index = Number(parts[3]);
      return Number.isInteger(index) && index >= 0 && index < 10 ? { kind, roundId: a, index } : null;
    }
    case "freeform":
    case "freeform-modal":
    case "pass":
    case "resolve":
      return { kind, roundId: a };
    case "wizard": {
      const page = Number(parts[3]);
      const action = parts.slice(4).join(":");
      return Number.isInteger(page) && action ? { kind, campaignId: a, page, action } : null;
    }
    case "levelup":
      return { kind, characterId: a };
    case "approval":
    case "approval-modal": {
      const action = parts[3] ?? "";
      return APPROVAL_ACTIONS.includes(action)
        ? { kind, approvalId: a, action: action as ApprovalAction }
        : null;
    }
    case "battle": {
      const action = parts[3] ?? "";
      return BATTLE_ACTIONS.includes(action) ? { kind, roundId: a, action: action as BattleAction } : null;
    }
    case "battle-pick": {
      const action = parts[3] ?? "";
      const arg = parts[4];
      if (!BATTLE_ACTIONS.includes(action) || (arg !== undefined && !ARG.test(arg))) return null;
      return { kind, roundId: a, action: action as BattleAction, ...(arg ? { arg } : {}) };
    }
    case "gallery": {
      const index = Number(parts[3]);
      const words = (parts[4] ?? "").split("+").filter(Boolean);
      return Number.isInteger(index) && index >= 0 && index < 1000 && words.every((w) => WORD.test(w))
        ? { kind, campaignId: a, index, words }
        : null;
    }
    case "gallery-share":
      return UUID.test(parts[3] ?? "") ? { kind, campaignId: a, sceneId: parts[3] as string } : null;
    case "story": {
      const action = parts[3] ?? "";
      return STORY_ACTIONS.includes(action) ? { kind, campaignId: a, action: action as StoryAction } : null;
    }
    case "rewind": {
      const action = parts[3] ?? "";
      const seq = parts[4] === undefined ? undefined : Number(parts[4]);
      if (!REWIND_ACTIONS.includes(action) || (seq !== undefined && !(Number.isInteger(seq) && seq >= 0)))
        return null;
      return { kind, campaignId: a, action: action as RewindAction, ...(seq !== undefined ? { seq } : {}) };
    }
    case "writer-retry":
      return { kind, jobId: a };
    default:
      return { kind, campaignId: a } as CustomId;
  }
}
