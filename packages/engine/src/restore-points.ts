/**
 * Restore points: where the game stood after each turn, so a host, DM or guardian can rewind past a turn that
 * went wrong. History stays append-only; a rewind puts the state back and marks the undone turns as rewound.
 *
 * Saved: the story position, every hero's sheet (hit points, conditions, spell slots, level and gold), their
 * packs, quests, promises, people met, places found, canon, the scene they were in and the choices before
 * them, the loom, and the chapter plan. Not saved: names, looks and pictures, which players may have changed
 * since and which a rewind shouldn't take away.
 */
import type { DbOrTx } from "@dq/db";
import {
  campaignRegions,
  campaigns,
  canonEntities,
  chapterSummaries,
  characters,
  inventoryItems,
  npcs,
  promises,
  quests,
  rounds,
  scenes,
  storyPlans,
} from "@dq/db";
import { campaignLoom, restorePoints } from "@dq/db/loom";
import { and, desc, eq, inArray, isNull, lt, ne, notInArray } from "drizzle-orm";

type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"];

export interface RestorePoint {
  version: 1;
  story: Record<string, unknown>;
  status: string;
  heroes: Array<
    Pick<
      Row<typeof characters>,
      | "id"
      | "status"
      | "level"
      | "xp"
      | "abilities"
      | "skills"
      | "expertise"
      | "armorId"
      | "shield"
      | "hp"
      | "hpMax"
      | "tempHp"
      | "conditions"
      | "resources"
      | "gold"
    >
  >;
  inventory: Array<Row<typeof inventoryItems>>;
  quests: Array<Row<typeof quests>>;
  promises: Array<Row<typeof promises>>;
  npcs: Array<Row<typeof npcs>>;
  regions: Array<Row<typeof campaignRegions>>;
  canon: Array<Row<typeof canonEntities>>;
  scene: { id: string; state: Record<string, unknown> } | null;
  round: { kind: "exploration" | "combat"; n: number; choices: unknown[] } | null;
  loom: Record<string, unknown> | null;
  plan: { version: number; plan: Record<string, unknown> } | null;
  chapters: number[];
}

/** Saves where the game stands right now, as turn `turnSeq` leaves it, with `roundId` the round now open. */
export async function saveRestorePoint(
  tx: DbOrTx,
  campaignId: string,
  turnSeq: number,
  roundId: string | null,
): Promise<void> {
  const [c] = await tx.select().from(campaigns).where(eq(campaigns.id, campaignId));
  if (!c) return;
  const heroes = await tx.select().from(characters).where(eq(characters.campaignId, campaignId));
  const ids = heroes.map((h) => h.id);
  const sceneId = typeof c.story.sceneId === "string" ? c.story.sceneId : null;
  // One at a time: a transaction is one connection, and queries sent to it together only queue up (and draw
  // a warning from pg, an error from pg 9).
  const inventory =
    ids.length > 0
      ? await tx.select().from(inventoryItems).where(inArray(inventoryItems.characterId, ids))
      : [];
  const questRows = await tx.select().from(quests).where(eq(quests.campaignId, campaignId));
  const promiseRows = await tx.select().from(promises).where(eq(promises.campaignId, campaignId));
  const npcRows = await tx.select().from(npcs).where(eq(npcs.campaignId, campaignId));
  const regionRows = await tx
    .select()
    .from(campaignRegions)
    .where(eq(campaignRegions.campaignId, campaignId));
  const canonRows = await tx.select().from(canonEntities).where(eq(canonEntities.campaignId, campaignId));
  const sceneRows = sceneId ? await tx.select().from(scenes).where(eq(scenes.id, sceneId)) : [];
  const roundRows = roundId ? await tx.select().from(rounds).where(eq(rounds.id, roundId)) : [];
  const [loomRow] = await tx.select().from(campaignLoom).where(eq(campaignLoom.campaignId, campaignId));
  const [planRow] = await tx
    .select()
    .from(storyPlans)
    .where(eq(storyPlans.campaignId, campaignId))
    .orderBy(desc(storyPlans.version))
    .limit(1);
  const chapters = await tx
    .select({ chapter: chapterSummaries.chapter })
    .from(chapterSummaries)
    .where(eq(chapterSummaries.campaignId, campaignId));
  const scene = sceneRows[0];
  const round = roundRows[0];
  const point: RestorePoint = {
    version: 1,
    story: c.story,
    status: c.status,
    heroes: heroes.map((h) => ({
      id: h.id,
      status: h.status,
      level: h.level,
      xp: h.xp,
      abilities: h.abilities,
      skills: h.skills,
      expertise: h.expertise,
      armorId: h.armorId,
      shield: h.shield,
      hp: h.hp,
      hpMax: h.hpMax,
      tempHp: h.tempHp,
      conditions: h.conditions,
      resources: h.resources,
      gold: h.gold,
    })),
    inventory,
    quests: questRows,
    promises: promiseRows,
    npcs: npcRows,
    regions: regionRows,
    canon: canonRows,
    scene: scene ? { id: scene.id, state: scene.state } : null,
    round: round ? { kind: round.kind, n: round.n, choices: round.choices } : null,
    loom: loomRow?.state ?? null,
    plan: planRow ? { version: planRow.version, plan: planRow.plan } : null,
    chapters: chapters.map((x) => x.chapter),
  };
  await tx
    .insert(restorePoints)
    .values({ campaignId, turnSeq, state: point as unknown as Record<string, unknown> })
    .onConflictDoUpdate({
      target: [restorePoints.campaignId, restorePoints.turnSeq],
      set: { state: point as unknown as Record<string, unknown>, createdAt: new Date() },
    });
}

export async function loadRestorePoint(
  db: DbOrTx,
  campaignId: string,
  turnSeq: number,
): Promise<RestorePoint | null> {
  const [row] = await db
    .select()
    .from(restorePoints)
    .where(and(eq(restorePoints.campaignId, campaignId), eq(restorePoints.turnSeq, turnSeq)));
  return (row?.state as unknown as RestorePoint | undefined) ?? null;
}

/** The turns a campaign can rewind to, newest first. */
export async function restorePointSeqs(db: DbOrTx, campaignId: string, before: number, limit = 10) {
  const rows = await db
    .select({ turnSeq: restorePoints.turnSeq, state: restorePoints.state, at: restorePoints.createdAt })
    .from(restorePoints)
    .where(and(eq(restorePoints.campaignId, campaignId), lt(restorePoints.turnSeq, before)))
    .orderBy(desc(restorePoints.turnSeq))
    .limit(limit);
  return rows.map((r) => {
    const point = r.state as unknown as RestorePoint;
    const scene = point.scene?.state as
      | { title?: string; combat?: { phase?: string; round?: number } }
      | undefined;
    return {
      turnSeq: r.turnSeq,
      at: r.at,
      sceneTitle: scene?.title ?? "the story",
      fighting: scene?.combat?.phase === "fighting",
      battleRound: scene?.combat?.round ?? 0,
      heroes: point.heroes.map((h) => ({ id: h.id, hp: h.hp, hpMax: h.hpMax })),
    };
  });
}

/**
 * Puts a restore point back. Heroes who joined since keep what they have; everything the point saved goes
 * back as it was, and things that came into being after it (canon, promises, chapter recaps) go away.
 * Returns the scene and round to show. The caller cancels open rounds, records the rewind and the new seq.
 */
export async function applyRestorePoint(
  tx: DbOrTx,
  campaignId: string,
  point: RestorePoint,
  turnSeq: number,
): Promise<{ sceneId: string | null; roundId: string | null }> {
  for (const h of point.heroes) {
    const { id, ...sheet } = h;
    await tx
      .update(characters)
      .set({ ...sheet, updatedAt: new Date() })
      .where(eq(characters.id, id));
  }
  const ids = point.heroes.map((h) => h.id);
  if (ids.length > 0) await tx.delete(inventoryItems).where(inArray(inventoryItems.characterId, ids));
  if (point.inventory.length > 0) await tx.insert(inventoryItems).values(point.inventory);

  await tx.delete(quests).where(eq(quests.campaignId, campaignId));
  if (point.quests.length > 0) await tx.insert(quests).values(point.quests);
  await tx.delete(npcs).where(eq(npcs.campaignId, campaignId));
  if (point.npcs.length > 0) await tx.insert(npcs).values(point.npcs);
  await tx.delete(campaignRegions).where(eq(campaignRegions.campaignId, campaignId));
  if (point.regions.length > 0) await tx.insert(campaignRegions).values(point.regions);
  await tx.delete(promises).where(eq(promises.campaignId, campaignId));
  if (point.promises.length > 0) await tx.insert(promises).values(point.promises);
  await tx.delete(canonEntities).where(eq(canonEntities.campaignId, campaignId));
  if (point.canon.length > 0) await tx.insert(canonEntities).values(point.canon);

  await tx
    .delete(chapterSummaries)
    .where(
      point.chapters.length > 0
        ? and(
            eq(chapterSummaries.campaignId, campaignId),
            notInArray(chapterSummaries.chapter, point.chapters),
          )
        : eq(chapterSummaries.campaignId, campaignId),
    );
  if (point.loom)
    await tx
      .update(campaignLoom)
      .set({ state: point.loom, pending: null, updatedAt: new Date() })
      .where(eq(campaignLoom.campaignId, campaignId));
  if (point.plan) {
    // Plans are versioned; the old plan comes back as the newest version.
    const [latest] = await tx
      .select({ version: storyPlans.version })
      .from(storyPlans)
      .where(eq(storyPlans.campaignId, campaignId))
      .orderBy(desc(storyPlans.version))
      .limit(1);
    if ((latest?.version ?? 0) !== point.plan.version)
      await tx.insert(storyPlans).values({
        campaignId,
        version: (latest?.version ?? 0) + 1,
        plan: point.plan.plan,
        reason: "rewind",
        createdBy: "director",
      });
  }

  let roundId: string | null = null;
  if (point.scene) {
    await tx
      .update(scenes)
      .set({ state: point.scene.state, endedTurn: null })
      .where(eq(scenes.id, point.scene.id));
    if (point.round) {
      const [r] = await tx
        .insert(rounds)
        .values({
          campaignId,
          sceneId: point.scene.id,
          n: point.round.n,
          kind: point.round.kind,
          choices: point.round.choices,
        })
        .returning();
      roundId = r?.id ?? null;
    }
  }
  // Scenes begun after the point are over: they never happened.
  await tx
    .update(scenes)
    .set({ endedTurn: turnSeq })
    .where(
      and(
        eq(scenes.campaignId, campaignId),
        isNull(scenes.endedTurn),
        point.scene ? ne(scenes.id, point.scene.id) : undefined,
      ),
    );
  return { sceneId: point.scene?.id ?? null, roundId };
}
