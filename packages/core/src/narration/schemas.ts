import { z } from "zod";
import { DeltaProposal } from "../deltas/index";
import { DEED_TAGS } from "../loom/vocab";
import { ABILITIES } from "../rules/abilities";
import { SKILL_IDS } from "../rules/skills";

/**
 * Structured outputs the AI must return. These schemas avoid length and range
 * constraints (not every provider supports them); limits are enforced after
 * parsing by the engine.
 */

export const SKILL_OR_NONE = ["none", ...SKILL_IDS] as [string, ...string[]];
export const DEED_OR_NONE = ["none", ...DEED_TAGS] as [string, ...string[]];
export const DIFFICULTIES = ["easy", "medium", "hard", "very_hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_DC: Record<Difficulty, number> = { easy: 10, medium: 13, hard: 16, very_hard: 20 };

export const IntentHint = z.object({
  approach: z.string(),
  skill: z.enum(SKILL_OR_NONE),
  difficulty: z.enum(DIFFICULTIES),
  deed: z.enum(DEED_OR_NONE),
  targetRef: z.string().nullable(),
  shortcutId: z.string().nullable(),
});
export type IntentHint = z.infer<typeof IntentHint>;

export const ImageBriefSchema = z.object({
  setting: z.string(),
  subjects: z.array(z.string()),
  mood: z.string(),
  timeOfDay: z.string(),
});

export const NarratorOutput = z.object({
  narration: z.string(),
  npcLines: z.array(z.object({ npcRef: z.string(), line: z.string() })),
  proposedDeltas: z.array(DeltaProposal),
  choices: z.array(z.object({ label: z.string(), intent: IntentHint })),
  goalMet: z.boolean(),
  imageBrief: ImageBriefSchema.nullable(),
  significance: z.enum(["minor", "notable", "major"]),
});
export type NarratorOutput = z.infer<typeof NarratorOutput>;

export const ParsedAction = z.object({
  characterRef: z.string(),
  summary: z.string(),
  approach: z.string(),
  needsRoll: z.boolean(),
  ability: z.enum(["none", ...ABILITIES] as [string, ...string[]]),
  skill: z.enum(SKILL_OR_NONE),
  difficulty: z.enum(DIFFICULTIES),
  targetRef: z.string().nullable(),
  helpsCharacterRef: z.string().nullable(),
  deeds: z.array(
    z.object({
      tag: z.enum([...DEED_TAGS] as [string, ...string[]]),
      targetRef: z.string().nullable(),
      evidence: z.string(),
      forgoneBenefit: z.number().int(),
      riskTaken: z.boolean(),
    }),
  ),
  keepsPromiseTo: z.string().nullable(),
  makesPromiseTo: z.string().nullable(),
  isMetaQuestion: z.boolean(),
});
export type ParsedAction = z.infer<typeof ParsedAction>;

export const IntentOutput = z.object({ actions: z.array(ParsedAction) });
export type IntentOutput = z.infer<typeof IntentOutput>;

export const SafetyOutput = z.object({
  allow: z.boolean(),
  categories: z.array(z.string()),
  isMetaProbe: z.boolean(),
  isPromptInjection: z.boolean(),
});
export type SafetyOutput = z.infer<typeof SafetyOutput>;

export const JudgeOutput = z.object({
  revealsHiddenMechanic: z.boolean(),
  explainsCauseOfLuck: z.boolean(),
  unsafeForChildren: z.boolean(),
  note: z.string(),
});
export type JudgeOutput = z.infer<typeof JudgeOutput>;

/** Limits checked after parsing. */
export const NARRATION_LIMITS = {
  narration: 1800,
  npcLine: 300,
  choiceLabel: 80,
  minChoices: 2,
  maxChoices: 4,
  maxNpcLines: 4,
};
