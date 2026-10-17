import { LENGTH_SCENES, STORY_LENGTHS, type StoryLength } from "../story/living";

/**
 * A campaign's story settings, chosen when it's created ("Shape your adventure") and changed with
 * /campaign story: how dark it gets, how it's told, what the pictures look like, and what the table wants in
 * it or left out. The world's hard limits apply at every setting.
 */

export const INTENSITIES = ["light", "classic", "epic"] as const;
export type Intensity = (typeof INTENSITIES)[number];
export const VOICES = ["fireside", "classic", "cinematic"] as const;
export type Voice = (typeof VOICES)[number];
export const HUMORS = ["plenty", "some", "rare"] as const;
export type Humor = (typeof HUMORS)[number];
export const ART_STYLES = ["book", "painterly", "watercolor", "custom"] as const;
export type ArtStyle = (typeof ART_STYLES)[number];

export interface StoryProfile {
  intensity: Intensity;
  voice: Voice;
  humor: Humor;
  art: ArtStyle;
  /** The picture style the host wrote, when art is "custom". */
  artCustom: string;
  /** What this table's story should feel like: names, mood, villains, motifs. Colors the world; never rewrites it. */
  premise: string;
  /** Topics left out of the story entirely. */
  lines: string[];
  /** Topics that may happen but are never shown. */
  veils: string[];
  /** How long the story runs: the director paces its threats and decisive moments to it. */
  length: StoryLength;
}

export const PROFILE_LIMITS = { premise: 500, artCustom: 200, topic: 60, topics: 10 } as const;

export const INTENSITY_INFO: Record<Intensity, { label: string; like: string; blurb: string }> = {
  light: {
    label: "Light",
    like: "a fireside tale",
    blurb: "Mild peril and scuffles. Foes run off, give up or are caught, and nobody dies.",
  },
  classic: {
    label: "Classic",
    like: "The Hobbit",
    blurb: "Real danger and menace, fierce battles, loss and grief, all told without gore.",
  },
  epic: {
    label: "Epic",
    like: "The Lord of the Rings",
    blurb: "War, truly menacing villains, sacrifice and slow dread. Family campaigns need a guardian.",
  },
};

export const VOICE_INFO: Record<Voice, { label: string; blurb: string; prompt: string }> = {
  fireside: {
    label: "Fireside",
    blurb: "A warm, wry storyteller by the fire",
    prompt:
      "Tell the tale like a warm, wry storyteller by the fire: personal and vivid, with the sounds and smells of each place, now and then speaking to the listeners directly. Never talk down to them.",
  },
  classic: {
    label: "Classic storybook",
    blurb: "Measured and descriptive, like a classic fantasy novel",
    prompt:
      "Write like a classic fantasy novel read aloud: measured, descriptive prose with a rich vocabulary, a sense of history and wonder, and room for quiet moments as well as danger. Never talk down to the reader.",
  },
  cinematic: {
    label: "Cinematic",
    blurb: "Brisk and vivid, moment to moment",
    prompt:
      "Write briskly and vividly, moment to moment, like a film: strong verbs, sharp images, tension and momentum. Never talk down to the reader.",
  },
};

export const HUMOR_INFO: Record<Humor, { label: string; prompt: string }> = {
  plenty: {
    label: "Plenty",
    prompt: "Use plenty of humor: banter, comic side characters, funny mishaps. Never at a player's expense.",
  },
  some: {
    label: "Some",
    prompt: "Use humor where it fits naturally, and let serious moments stay serious.",
  },
  rare: {
    label: "Rare",
    prompt: "Humor is rare: keep the mood earnest and let the stakes be felt.",
  },
};

export const LENGTH_INFO: Record<StoryLength, { label: string; blurb: string }> = {
  short: { label: "Short", blurb: `An evening or two, about ${LENGTH_SCENES.short} scenes` },
  standard: { label: "Standard", blurb: `A few weeks of play, about ${LENGTH_SCENES.standard} scenes` },
  long: { label: "Long", blurb: `A long campaign, about ${LENGTH_SCENES.long} scenes` },
};

export const ART_INFO: Record<Exclude<ArtStyle, "custom">, { label: string; prompt: string }> & {
  custom: { label: string };
} = {
  book: {
    label: "Classic book illustration",
    prompt:
      "classic fantasy book illustration, detailed pen and ink with watercolor wash, muted earthy colors, in the tradition of mid-century fantasy novel illustrations",
  },
  painterly: {
    label: "Painterly fantasy",
    prompt:
      "painterly fantasy illustration, rich color, dramatic natural light, detailed landscapes and characters, cinematic composition",
  },
  watercolor: {
    label: "Storybook watercolor",
    prompt: "storybook watercolor illustration, soft edges, warm lantern light against cool blue twilight",
  },
  custom: { label: "My own style" },
};

/** New campaigns start here unless the server's setup page chose other defaults. */
export const DEFAULT_PROFILE: StoryProfile = {
  intensity: "classic",
  voice: "classic",
  humor: "some",
  art: "book",
  artCustom: "",
  premise: "",
  lines: [],
  veils: [],
  length: "standard",
};

/** How campaigns made before story settings existed were told, so they keep their feel until changed. */
const LEGACY_PROFILE: Omit<StoryProfile, "intensity"> = {
  voice: "fireside",
  humor: "plenty",
  art: "watercolor",
  artCustom: "",
  premise: "",
  lines: [],
  veils: [],
  length: "standard",
};

const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined =>
  list.includes(v as T) ? (v as T) : undefined;

const text = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Cleans a list of topics typed as "spiders, drowning; the dark" or as an array. */
export function parseTopics(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;\n]+/) : [];
  const out: string[] = [];
  for (const item of raw) {
    const t = text(item, PROFILE_LIMITS.topic);
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
    if (out.length === PROFILE_LIMITS.topics) break;
  }
  return out;
}

/**
 * Reads a campaign's story settings. Anything missing or unexpected falls back: to `base` for new campaigns, or
 * for campaigns made before story settings existed, to how they were told then (gentle became Light).
 */
export function parseProfile(
  raw: unknown,
  legacy?: { contentLevel?: unknown },
  base = DEFAULT_PROFILE,
): StoryProfile {
  const r = (raw && typeof raw === "object" ? raw : null) as Record<string, unknown> | null;
  const fallback: StoryProfile = r
    ? base
    : legacy?.contentLevel === "adventurous"
      ? { ...LEGACY_PROFILE, intensity: "classic" }
      : legacy?.contentLevel === "gentle"
        ? { ...LEGACY_PROFILE, intensity: "light" }
        : base;
  const art = oneOf(ART_STYLES, r?.art) ?? fallback.art;
  const artCustom = text(r?.artCustom, PROFILE_LIMITS.artCustom);
  return {
    intensity: oneOf(INTENSITIES, r?.intensity) ?? fallback.intensity,
    voice: oneOf(VOICES, r?.voice) ?? fallback.voice,
    humor: oneOf(HUMORS, r?.humor) ?? fallback.humor,
    art: art === "custom" && !artCustom ? fallback.art : art,
    artCustom,
    premise: text(r?.premise, PROFILE_LIMITS.premise),
    lines: parseTopics(r?.lines),
    veils: parseTopics(r?.veils),
    length: oneOf(STORY_LENGTHS, r?.length) ?? fallback.length,
  };
}

/**
 * The intensity a story is actually told at. Epic on a family campaign needs a grown-up watching over it; without
 * one it plays at Classic.
 */
export function effectiveIntensity(
  chosen: Intensity,
  audience: "family" | "teen",
  hasGuardian: boolean,
): Intensity {
  return chosen === "epic" && audience === "family" && !hasGuardian ? "classic" : chosen;
}

/** "Classic (like The Hobbit) · Classic storybook voice · some humor · standard story" */
export function describeProfile(p: StoryProfile, told?: Intensity): string {
  const i = INTENSITY_INFO[told ?? p.intensity];
  const capped =
    told && told !== p.intensity ? ` (${INTENSITY_INFO[p.intensity].label} needs a guardian)` : "";
  return `${i.label}, like ${i.like}${capped} · ${VOICE_INFO[p.voice].label} voice · ${HUMOR_INFO[p.humor].label.toLowerCase()} humor · ${LENGTH_INFO[p.length].label.toLowerCase()} story`;
}
