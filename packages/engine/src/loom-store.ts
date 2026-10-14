/**
 * The only engine module that reads or writes the hidden loom tables.
 */
import { emptyLoomState, type LoomResult, type LoomState } from "@dq/core/loom";
import type { DbOrTx } from "@dq/db";
import { campaignLoom, evaluations } from "@dq/db/loom";
import { eq } from "drizzle-orm";

export interface LoomRecord {
  masterSeed: string;
  state: LoomState;
}

export async function loadLoom(db: DbOrTx, campaignId: string): Promise<LoomRecord> {
  const [row] = await db.select().from(campaignLoom).where(eq(campaignLoom.campaignId, campaignId));
  if (!row) throw new Error(`campaign ${campaignId} has no loom record`);
  return { masterSeed: row.masterSeed, state: (row.state as unknown as LoomState) ?? emptyLoomState() };
}

export async function createLoom(db: DbOrTx, campaignId: string, masterSeed: string): Promise<void> {
  await db
    .insert(campaignLoom)
    .values({ campaignId, masterSeed, state: emptyLoomState() as unknown as Record<string, unknown> });
}

export async function saveLoom(
  db: DbOrTx,
  campaignId: string,
  turnSeq: number,
  inputHash: string,
  result: LoomResult,
): Promise<void> {
  await db
    .update(campaignLoom)
    .set({ state: result.state as unknown as Record<string, unknown>, updatedAt: new Date() })
    .where(eq(campaignLoom.campaignId, campaignId));
  await db.insert(evaluations).values({
    campaignId,
    turnSeq,
    inputHash,
    result: {
      directives: result.directives,
      constraints: result.constraints,
      effects: result.effects,
      crux: result.crux,
      audit: result.audit,
    } as unknown as Record<string, unknown>,
  });
}

export interface PendingLoom {
  seq: number;
  inputHash: string;
  result: LoomResult;
}

/** A loom result waiting on the DM's approval in Assist mode. */
export async function savePendingLoom(db: DbOrTx, campaignId: string, pending: PendingLoom): Promise<void> {
  await db
    .update(campaignLoom)
    .set({ pending: pending as unknown as Record<string, unknown> })
    .where(eq(campaignLoom.campaignId, campaignId));
}

export async function loadPendingLoom(db: DbOrTx, campaignId: string): Promise<PendingLoom | null> {
  const [row] = await db.select().from(campaignLoom).where(eq(campaignLoom.campaignId, campaignId));
  return (row?.pending as unknown as PendingLoom | null) ?? null;
}

export async function clearPendingLoom(db: DbOrTx, campaignId: string): Promise<void> {
  await db.update(campaignLoom).set({ pending: null }).where(eq(campaignLoom.campaignId, campaignId));
}

/** Spoiler view for an Assist-mode DM: qualitative only, never raw weights. */
export async function dmLoomView(db: DbOrTx, campaignId: string) {
  const { state } = await loadLoom(db, campaignId);
  const ripenessWord = (planted: number, span: number, now: number) => {
    const r = span <= 0 ? 1 : (now - planted) / span;
    return r >= 1 ? "ripe" : r >= 0.3 ? "budding" : "seedling";
  };
  const now = Math.max(0, ...state.deeds.map((d) => d.progress));
  return {
    threads: state.threads.map((t) => ({
      id: t.id,
      deed: t.summary,
      kind: t.tag,
      anchor: t.anchor?.name ?? null,
      state: t.state === "woven" ? "woven" : ripenessWord(t.plantedProgress, t.ripenSpan, now),
      reservedForFinale: Boolean(t.reservedForBeat),
    })),
    snares: state.snares.map((s) => ({
      id: s.id,
      deed: s.summary,
      effect: s.effect,
      state: s.state,
      hint: s.hint,
    })),
    bearers: state.bearers.filter((b) => b.mustSurvive).map((b) => ({ name: b.name, presence: b.presence })),
    detours: state.detours.map((d) => ({
      id: d.id,
      template: d.templateId,
      state: d.state,
      target: d.target.beatId,
    })),
  };
}
