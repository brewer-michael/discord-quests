import type { Intensity } from "../narration/profile";
import type { Rng } from "../rng/index";
import type { World } from "../world/types";

/**
 * Local, deterministic safety layers. These run before and after any AI call
 * and never depend on a provider. An AI classifier adds a second layer on top
 * (in the engine), but these alone must keep the table safe if it fails.
 */

export type SafetyCategory =
  | "banned_word"
  | "personal_info"
  | "too_long"
  | "meta_probe"
  | "hidden_leak"
  | "empty";

export interface SafetyFinding {
  category: SafetyCategory;
  match: string;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const LOOKALIKES: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
};

/** The ways a word gets disguised: digits for letters, letters spread apart, letters stretched out. */
function textVariants(text: string): string[] {
  const lower = text.toLowerCase();
  const lookalike = lower.replace(/[013457@$]/g, (ch) => LOOKALIKES[ch] ?? ch);
  const joined = lookalike.replace(/\b(?:[a-z][\s.\-_]+){2,}[a-z]\b/g, (m) => m.replace(/[\s.\-_]+/g, ""));
  return [...new Set([lower, lookalike, joined])];
}

const squash = (s: string) => s.replace(/([a-z])\1+/g, "$1");

export function findBannedTerms(text: string, terms: readonly string[]): string[] {
  const variants = textVariants(text);
  const squashed = variants.map(squash);
  const hits: string[] = [];
  for (const term of terms) {
    const t = term.toLowerCase();
    const plain = new RegExp(`\\b${escapeRe(t)}\\b`);
    const stretched = new RegExp(`\\b${escapeRe(squash(t))}\\b`);
    // One or more letters after the first hidden behind * or #, like "f*ck".
    const masked = new RegExp(
      `\\b${escapeRe(t.charAt(0))}${[...t.slice(1)].map((ch) => `[${escapeRe(ch)}*#]`).join("")}(?![a-z])`,
    );
    if (
      variants.some((v) => plain.test(v) || (/[*#]/.test(v) && masked.test(v))) ||
      squashed.some((v) => stretched.test(v))
    )
      hits.push(term);
  }
  return hits;
}

/** Strong language that is never acceptable regardless of world settings. */
export const BASELINE_BANNED = [
  "fuck",
  "fucking",
  "shit",
  "bitch",
  "bastard",
  "asshole",
  "cunt",
  "dick",
  "slut",
  "whore",
  "nazi",
  "rape",
  "porn",
  "sex",
  "naked",
  "nude",
] as const;

/** Words refused at this intensity: strong language always, the world's banned words always, and its Light-only list at Light. */
export function bannedTermsFor(world: Pick<World, "content">, intensity: Intensity): string[] {
  return [...BASELINE_BANNED, ...world.content.bannedTerms, ...world.content.levels[intensity].bannedTerms];
}

/** The strictest list, for things that must suit every intensity (authored text, picture prompts). */
export function strictBannedTerms(world: Pick<World, "content">): string[] {
  return bannedTermsFor(world, "light");
}

const PII_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "email", re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i },
  { name: "phone", re: /(\+?\d[\d\s().-]{8,}\d)/ },
  {
    name: "address",
    re: /\b\d{1,5}\s+\w+(\s\w+)?\s+(street|st|road|rd|avenue|ave|lane|ln|drive|dr|court|ct|way|blvd)\b/i,
  },
  { name: "age", re: /\b(i'?m|i am|my age is)\s+\d{1,2}\s*(years?|yrs?)?\s*old\b/i },
  {
    name: "school",
    re: /\b(my school|i go to|i attend)\s+[A-Z][\w']+(\s[A-Z][\w']+)*\s+(school|elementary|academy|middle|primary)\b/i,
  },
  { name: "location", re: /\b(i live (in|on|at)|my address|my house is)\b/i },
  { name: "real-name", re: /\bmy (real|full|last) name is\b/i },
];

export function findPersonalInfo(text: string): string[] {
  return PII_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.name);
}

const META_PATTERNS = [
  /\b(hidden|secret)\s+(stat|stats|score|number|value|meter|points?)\b/i,
  /\b(luck|karma|fate|destiny|grace)\s+(score|stat|points?|meter|level|value)\b/i,
  /\bwhat('?s| is| are) (my|our|the) (luck|karma|odds|chances?|fate)\b/i,
  /\bhow (does|do) (the )?(game|bot|ai|dm|storyteller|story) (decide|choose|pick|work out)\b/i,
  /\b(show|tell) (me|us) (the|your) (rules|prompt|instructions|system prompt|secrets?)\b/i,
  /\bignore (all |your )?(previous|prior|above) (instructions|rules)\b/i,
  /\b(system prompt|developer message|you are an ai|jailbreak)\b/i,
];

/** Questions about hidden mechanics, odds or the AI itself. Answered in character, without calling the AI. */
export function isMetaProbe(text: string): boolean {
  return META_PATTERNS.some((re) => re.test(text));
}

export const MAX_PLAYER_TEXT = 500;

export interface PlayerTextVerdict {
  allow: boolean;
  findings: SafetyFinding[];
  /** Gentle message for the player when blocked. */
  message: string | null;
  metaProbe: boolean;
}

/** Checks what a player typed. At Classic and Epic, "I slay the troll" is a normal adventure action. */
export function checkPlayerText(
  text: string,
  world: Pick<World, "content">,
  intensity: Intensity = "light",
): PlayerTextVerdict {
  const findings: SafetyFinding[] = [];
  const trimmed = text.trim();
  if (trimmed.length === 0) findings.push({ category: "empty", match: "" });
  if (trimmed.length > MAX_PLAYER_TEXT)
    findings.push({ category: "too_long", match: String(trimmed.length) });
  for (const term of findBannedTerms(trimmed, bannedTermsFor(world, intensity))) {
    findings.push({ category: "banned_word", match: term });
  }
  for (const kind of findPersonalInfo(trimmed)) findings.push({ category: "personal_info", match: kind });
  const metaProbe = isMetaProbe(trimmed);

  let message: string | null = null;
  if (findings.some((f) => f.category === "personal_info")) {
    message =
      "Let's keep real-life details like names, ages and addresses out of the story. Try saying it another way!";
  } else if (findings.some((f) => f.category === "banned_word")) {
    message = "Let's keep our tale friendly. Try another way of saying that!";
  } else if (findings.some((f) => f.category === "too_long")) {
    message = `That's a lot to do at once! Try describing it in under ${MAX_PLAYER_TEXT} characters.`;
  } else if (findings.some((f) => f.category === "empty")) {
    message = "What would you like to do?";
  }
  return { allow: message === null, findings, message, metaProbe };
}

const LEAK_PATTERNS: RegExp[] = [
  /\b(hidden|secret)\s+(stat|score|value|tally|meter)\b/i,
  /\b(luck|karma|fate|grace)\s+(score|stat|points?|meter|tally)\b/i,
  /\bkarma\b/i,
  /\bprovidence\b/i,
  /\b(the|a|your|their) loom\b/i,
  /\bthreads? of (fate|destiny)\b/i,
  /\b(destiny|destined|fated|meant to be|it was written)\b/i,
  /\bbecause (you|they|the heroes|we) (once |had )?(spared|helped|showed (him |her |them )?mercy|were kind|kept (your|their|our) promise)/i,
  /\b(repay|repays|repaying|repaid|returning|returned) (your|their|the heroes'?|our) (kindness|mercy|favou?r|help)\b/i,
  /\b(for|after) (sparing|saving) (him|her|them) (earlier|before|back)\b/i,
  /\b(kindness|mercy) (has been|was) (rewarded|repaid)\b/i,
];

/** Narration must never reveal or explain the loom. */
export function findLeaks(text: string, extra: readonly RegExp[] = []): string[] {
  const hits: string[] = [];
  for (const re of [...LEAK_PATTERNS, ...extra]) {
    const m = re.exec(text);
    if (m) hits.push(m[0]);
  }
  return hits;
}

export interface NarrationVerdict {
  ok: boolean;
  findings: SafetyFinding[];
}

export function checkNarration(
  text: string,
  world: Pick<World, "content">,
  opts: { intensity: Intensity; extraLeakPatterns?: readonly RegExp[] },
): NarrationVerdict {
  const findings: SafetyFinding[] = [];
  for (const term of findBannedTerms(text, bannedTermsFor(world, opts.intensity)))
    findings.push({ category: "banned_word", match: term });
  for (const leak of findLeaks(text, opts.extraLeakPatterns))
    findings.push({ category: "hidden_leak", match: leak });
  for (const kind of findPersonalInfo(text)) findings.push({ category: "personal_info", match: kind });
  return { ok: findings.length === 0, findings };
}

export function pickDeflection(world: Pick<World, "deflections">, rng: Rng): string {
  return rng.pick(world.deflections);
}

export interface ImageBrief {
  setting: string;
  subjects: string[];
  mood: string;
  timeOfDay: string;
}

const IMAGE_NEGATIVE =
  "text, words, letters, watermark, signature, blood, gore, wounds, weapons pointed at the viewer, frightening faces, horror, realistic photograph, adult content";

/**
 * Builds an image prompt only from structured, allowlisted fields. Raw player
 * text never reaches the image provider.
 */
export function buildImagePrompt(
  brief: ImageBrief,
  world: Pick<World, "meta" | "content">,
): { prompt: string; negativePrompt: string } {
  const banned = strictBannedTerms(world);
  const clean = (s: string, max: number) => {
    let out = s
      .replace(/[^\p{L}\p{N} ,.'-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    for (const term of findBannedTerms(out, banned))
      out = out.replace(new RegExp(`\\b${escapeRe(term)}\\b`, "gi"), "");
    out = out.replace(/\b(named|called)\s+\S+/gi, "");
    return out.replace(/\s+/g, " ").trim().slice(0, max);
  };
  const subjects = brief.subjects
    .slice(0, 4)
    .map((s) => clean(s, 80))
    .filter(Boolean);
  const parts = [
    clean(brief.setting, 160),
    subjects.length > 0 ? subjects.join(", ") : "",
    clean(brief.mood, 60),
    clean(brief.timeOfDay, 30),
  ].filter(Boolean);
  const prompt = `${world.meta.artStyle}. ${parts.join(". ")}.`.replace(/\.\./g, ".").slice(0, 900);
  return { prompt, negativePrompt: IMAGE_NEGATIVE };
}
