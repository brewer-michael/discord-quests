import type { ClassFeature } from "../srd/classes";
import { SRD_CLASSES, type SrdClassId } from "../srd/classes";

/** Experience needed to reach each level (index = level - 1). */
export const XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000,
  225000, 265000, 305000, 355000,
] as const;

export const MAX_CAMPAIGN_LEVEL = 10;

export function levelForXp(xp: number, maxLevel = MAX_CAMPAIGN_LEVEL): number {
  let level = 1;
  for (let i = 0; i < XP_THRESHOLDS.length; i++) {
    if (xp >= (XP_THRESHOLDS[i] as number)) level = i + 1;
  }
  return Math.min(level, maxLevel);
}

export function xpForNextLevel(level: number): number | null {
  return level >= XP_THRESHOLDS.length ? null : (XP_THRESHOLDS[level] as number);
}

export interface LevelUpPreview {
  fromLevel: number;
  toLevel: number;
  newFeatures: ClassFeature[];
  abilityScoreImprovement: boolean;
  expertiseChoices: number;
}

export function previewLevelUp(classId: SrdClassId, fromLevel: number): LevelUpPreview {
  const cls = SRD_CLASSES[classId];
  const toLevel = fromLevel + 1;
  return {
    fromLevel,
    toLevel,
    newFeatures: cls.features.filter((f) => f.level === toLevel),
    abilityScoreImprovement: cls.asiLevels.includes(toLevel),
    expertiseChoices: cls.expertiseAt?.[toLevel] ?? 0,
  };
}

/** XP value of a defeated creature, by challenge rating (subset used by worlds). */
export const XP_BY_CR: Record<string, number> = {
  "0": 10,
  "1/8": 25,
  "1/4": 50,
  "1/2": 100,
  "1": 200,
  "2": 450,
  "3": 700,
  "4": 1100,
  "5": 1800,
  "6": 2300,
  "7": 2900,
  "8": 3900,
};
