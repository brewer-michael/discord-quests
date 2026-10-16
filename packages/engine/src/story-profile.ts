/**
 * A campaign's story settings as the engine uses them: what was chosen, and the intensity the story is actually
 * told at right now (Epic on a family campaign needs a guardian, or it plays at Classic).
 */
import {
  effectiveIntensity,
  type Intensity,
  type NarrationStory,
  parseProfile,
  type StoryProfile,
} from "@dq/core/narration";
import { campaignMembers, type DbOrTx } from "@dq/db";
import { and, eq } from "drizzle-orm";

type CampaignLike = { id: string; settings: unknown };

export function profileOf(c: Pick<CampaignLike, "settings">): StoryProfile {
  const s = (c.settings ?? {}) as Record<string, unknown>;
  return parseProfile(s.story, { contentLevel: s.contentLevel });
}

export function audienceOf(c: Pick<CampaignLike, "settings">): "family" | "teen" {
  return (c.settings as Record<string, unknown> | null)?.audience === "teen" ? "teen" : "family";
}

export async function hasGuardian(db: DbOrTx, campaignId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: campaignMembers.userId })
    .from(campaignMembers)
    .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.role, "guardian")))
    .limit(1);
  return Boolean(row);
}

export interface CampaignStory {
  profile: StoryProfile;
  /** What the narrator, planner and safety checks are given. */
  story: NarrationStory;
  /** True when the host chose Epic but it's playing at Classic for want of a guardian. */
  capped: boolean;
}

export async function campaignStory(db: DbOrTx, c: CampaignLike): Promise<CampaignStory> {
  const profile = profileOf(c);
  const audience = audienceOf(c);
  const intensity: Intensity =
    profile.intensity === "epic" && audience === "family"
      ? effectiveIntensity(profile.intensity, audience, await hasGuardian(db, c.id))
      : profile.intensity;
  return {
    profile,
    story: {
      intensity,
      voice: profile.voice,
      humor: profile.humor,
      premise: profile.premise,
      lines: profile.lines,
      veils: profile.veils,
    },
    capped: intensity !== profile.intensity,
  };
}
