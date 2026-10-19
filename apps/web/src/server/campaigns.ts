import { auditLog, campaignMembers, campaigns, characters, type DbOrTx, storyJobs, turns } from "@dq/db";
import { dmLoomView } from "@dq/engine/loom-store";
import { jobTitle, materialFor } from "@dq/engine/story-writer";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { audit } from "./audit";

export interface CampaignSummary {
  id: string;
  name: string;
  mode: "ai_dm" | "assist";
  status: string;
  players: number;
  turns: number;
  createdAt: Date;
  updatedAt: Date;
}

export async function listCampaigns(db: DbOrTx, guildId: string): Promise<CampaignSummary[]> {
  const rows = await db
    .select({
      c: campaigns,
      players: sql<number>`(select count(*)::int from ${campaignMembers} m where m.campaign_id = ${campaigns.id})`,
    })
    .from(campaigns)
    .where(eq(campaigns.guildId, guildId))
    .orderBy(desc(campaigns.updatedAt));
  return rows.map(({ c, players }) => ({
    id: c.id,
    name: c.name,
    mode: c.mode,
    status: c.status,
    players,
    turns: c.turnSeq,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));
}

async function owned(db: DbOrTx, guildId: string, campaignId: string) {
  const [c] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.guildId, guildId)));
  return c ?? null;
}

export async function getCampaign(db: DbOrTx, guildId: string, campaignId: string) {
  return owned(db, guildId, campaignId);
}

export async function setCampaignStatus(
  db: DbOrTx,
  args: { guildId: string; userId: string; campaignId: string; status: "paused" | "active" | "ended" },
) {
  const c = await owned(db, args.guildId, args.campaignId);
  if (!c || c.status === "ended" || c.status === "setup") return false;
  await db
    .update(campaigns)
    .set({ status: args.status, updatedAt: new Date() })
    .where(eq(campaigns.id, c.id));
  await audit(db, {
    guildId: args.guildId,
    userId: args.userId,
    action: `campaign.${args.status === "active" ? "resume" : args.status === "paused" ? "pause" : "end"}`,
    target: c.id,
    detail: { name: c.name },
  });
  return true;
}

/** Permanently deletes a campaign and all its history (the only path allowed past the append-only guard). */
export async function deleteCampaign(
  db: DbOrTx,
  args: { guildId: string; userId: string; campaignId: string; confirmName: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = await owned(db, args.guildId, args.campaignId);
  if (!c) return { ok: false, error: "That campaign no longer exists" };
  if (args.confirmName.trim() !== c.name)
    return { ok: false, error: "Type the campaign's name exactly to delete it" };
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.purge = 'on'`);
    await tx.delete(campaigns).where(eq(campaigns.id, c.id));
    await audit(tx, {
      guildId: args.guildId,
      userId: args.userId,
      action: "campaign.delete",
      target: c.id,
      detail: { name: c.name },
    });
  });
  return { ok: true };
}

/** What the table saw: heroes and the story so far. Nothing hidden is included. */
export async function exportCampaign(db: DbOrTx, guildId: string, campaignId: string) {
  const c = await owned(db, guildId, campaignId);
  if (!c) return null;
  const heroes = await db
    .select({
      name: characters.name,
      classId: characters.classId,
      pathId: characters.pathId,
      level: characters.level,
      status: characters.status,
    })
    .from(characters)
    .where(and(eq(characters.campaignId, c.id), eq(characters.status, "active")));
  const story = await db
    .select({ seq: turns.seq, data: turns.data, at: turns.committedAt })
    .from(turns)
    .where(and(eq(turns.campaignId, c.id), eq(turns.status, "committed")))
    .orderBy(asc(turns.seq));
  return {
    format: "discord-quests/campaign-export@1",
    exportedAt: new Date().toISOString(),
    campaign: { name: c.name, world: c.worldId, mode: c.mode, status: c.status, startedAt: c.createdAt },
    heroes,
    turns: story.map((t) => {
      const d = t.data as {
        narration?: { narration?: string; npcLines?: unknown; choices?: Array<{ label: string }> };
        actions?: Array<{ summary: string }>;
      };
      return {
        seq: t.seq,
        at: t.at,
        actions: (d.actions ?? []).map((a) => a.summary),
        narration: d.narration?.narration ?? "",
        voices: d.narration?.npcLines ?? [],
        choices: (d.narration?.choices ?? []).map((x) => x.label),
      };
    }),
  };
}

/** Peeking at the hidden hand needs a fresh, recorded "I accept spoilers" within this window. */
export const SPOILER_WINDOW_MS = 15 * 60 * 1000;

export async function hasSpoilerConsent(db: DbOrTx, userId: string, campaignId: string, now = new Date()) {
  const [row] = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.userId, userId),
        eq(auditLog.action, "loom.view"),
        eq(auditLog.target, campaignId),
        gte(auditLog.at, new Date(now.getTime() - SPOILER_WINDOW_MS)),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function grantSpoilerConsent(
  db: DbOrTx,
  args: { guildId: string; userId: string; campaignId: string },
) {
  const c = await owned(db, args.guildId, args.campaignId);
  if (!c) return false;
  await audit(db, { guildId: args.guildId, userId: args.userId, action: "loom.view", target: c.id });
  return true;
}

export async function loomForWeb(db: DbOrTx, guildId: string, userId: string, campaignId: string) {
  const c = await owned(db, guildId, campaignId);
  if (!c || !(await hasSpoilerConsent(db, userId, campaignId))) return null;
  const jobs = await db
    .select()
    .from(storyJobs)
    .where(eq(storyJobs.campaignId, campaignId))
    .orderBy(desc(storyJobs.createdAt))
    .limit(12);
  return {
    campaign: c,
    loom: await dmLoomView(db, campaignId),
    material: await materialFor(db, campaignId, c.story),
    writer: jobs.map((j) => ({
      id: j.id,
      what: jobTitle(j),
      why: j.reason,
      status: j.status,
      tries: j.attempts,
      steps: j.steps.map((s) => s.name),
      tokens: j.tokensUsed,
      minutes:
        j.startedAt && j.finishedAt ? Math.max(1, Math.round((+j.finishedAt - +j.startedAt) / 60_000)) : null,
      error: j.error,
      at: j.createdAt,
    })),
  };
}
