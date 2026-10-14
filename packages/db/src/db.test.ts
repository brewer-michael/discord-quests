import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, maskSecret, parseMasterKeys } from "./crypto";
import { rotateSecrets } from "./rotate";
import { campaignLoom, evaluations } from "./schema/loom";
import { campaigns, events, secrets, turns, webSessions } from "./schema/public";
import { createTestDb, TEST_DATABASE_URL } from "./testing";

describe("secret encryption", () => {
  const keys = parseMasterKeys(
    `v2:${randomBytes(32).toString("base64")},v1:${randomBytes(32).toString("base64")}`,
  );

  it("round-trips and masks", () => {
    const enc = encryptSecret("sk-test-123456", keys, "guild-1", "secret-1");
    expect(enc.keyVersion).toBe("v2");
    expect(decryptSecret(enc, keys, "guild-1", "secret-1")).toBe("sk-test-123456");
    expect(maskSecret(enc.last4)).toBe("•••• 3456");
  });

  it("refuses to decrypt in another row", () => {
    const enc = encryptSecret("sk-test-123456", keys, "guild-1", "secret-1");
    expect(() => decryptSecret(enc, keys, "guild-2", "secret-1")).toThrow();
    expect(() => decryptSecret(enc, keys, "guild-1", "secret-2")).toThrow();
  });

  it("rejects malformed key config", () => {
    expect(() => parseMasterKeys(undefined)).toThrow();
    expect(() => parseMasterKeys("v1:short")).toThrow();
  });
});

/** Drizzle wraps Postgres errors; the trigger's message is on the cause. */
async function rejectsWith(p: Promise<unknown>, re: RegExp) {
  try {
    await p;
  } catch (e) {
    const err = e as Error & { cause?: Error };
    expect(`${err.message} ${err.cause?.message ?? ""}`).toMatch(re);
    return;
  }
  throw new Error("expected the query to fail");
}

describe.skipIf(!TEST_DATABASE_URL)("database", () => {
  let handle: Awaited<ReturnType<typeof createTestDb>>;
  let campaignId: string;

  beforeAll(async () => {
    handle = await createTestDb();
    const [c] = await handle.db
      .insert(campaigns)
      .values({
        guildId: "g1",
        channelId: "c1",
        name: "Test",
        worldId: "lanternreach",
        worldVersion: "v",
        mode: "ai_dm",
        createdBy: "u1",
        story: {},
      })
      .returning();
    campaignId = c?.id as string;
  }, 30_000);

  afterAll(async () => {
    await handle?.drop();
  });

  it("keeps events append-only", async () => {
    const [e] = await handle.db
      .insert(events)
      .values({ campaignId, turnSeq: 1, type: "test", payload: { a: 1 } })
      .returning();
    await rejectsWith(
      handle.db
        .update(events)
        .set({ type: "changed" })
        .where(eq(events.id, e?.id as number)),
      /append-only/,
    );
    await rejectsWith(handle.db.delete(events).where(eq(events.id, e?.id as number)), /append-only/);
  });

  it("keeps loom evaluations append-only", async () => {
    await handle.db.insert(campaignLoom).values({ campaignId, masterSeed: "abc", state: {} });
    const [e] = await handle.db
      .insert(evaluations)
      .values({ campaignId, turnSeq: 1, inputHash: "h", result: {} })
      .returning();
    await rejectsWith(
      handle.db.delete(evaluations).where(eq(evaluations.id, e?.id as number)),
      /append-only/,
    );
  });

  it("freezes committed turns but allows recording the Discord message id", async () => {
    const [t] = await handle.db
      .insert(turns)
      .values({ campaignId, seq: 1, status: "committed", data: { x: 1 } })
      .returning();
    const id = t?.id as string;
    await handle.db.update(turns).set({ discordMessageId: "m1" }).where(eq(turns.id, id));
    await rejectsWith(
      handle.db
        .update(turns)
        .set({ data: { x: 2 } })
        .where(eq(turns.id, id)),
      /append-only/,
    );
    const [draft] = await handle.db.insert(turns).values({ campaignId, seq: 2, data: {} }).returning();
    await handle.db
      .update(turns)
      .set({ stage: "narrated" })
      .where(eq(turns.id, draft?.id as string));
  });

  it("rotates every stored secret to the newest master key", async () => {
    const v1 = { version: "v1", key: randomBytes(32) };
    const v2 = { version: "v2", key: randomBytes(32) };
    const id = "11111111-2222-4333-8444-555555555555";
    await handle.db
      .insert(secrets)
      .values({ id, guildId: "g-rot", ...encryptSecret("sk-old-key-1234", [v1], "g-rot", id) });
    const enc = encryptSecret("discord-token", [v1], null, "session:abc");
    await handle.db.insert(webSessions).values({
      id: "abc",
      userId: "u",
      username: "u",
      tokenCiphertext: enc.ciphertext,
      tokenIv: enc.iv,
      tokenTag: enc.tag,
      tokenKeyVersion: enc.keyVersion,
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(await rotateSecrets(handle.db, [v2, v1])).toEqual({ secrets: 1, sessions: 1 });
    const [s] = await handle.db.select().from(secrets).where(eq(secrets.id, id));
    expect(s?.keyVersion).toBe("v2");
    // Only the new key is needed from now on.
    expect(decryptSecret(s!, [v2], "g-rot", id)).toBe("sk-old-key-1234");
    const [w] = await handle.db.select().from(webSessions).where(eq(webSessions.id, "abc"));
    expect(
      decryptSecret(
        { ciphertext: w!.tokenCiphertext, iv: w!.tokenIv, tag: w!.tokenTag, keyVersion: w!.tokenKeyVersion },
        [v2],
        null,
        "session:abc",
      ),
    ).toBe("discord-token");
    expect(await rotateSecrets(handle.db, [v2, v1])).toEqual({ secrets: 0, sessions: 0 });
  });

  it("purges a whole campaign through the purge path only", async () => {
    await expect(handle.db.delete(campaigns).where(eq(campaigns.id, campaignId))).rejects.toThrow();
    await handle.db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL app.purge = 'on'`);
      await tx.delete(campaigns).where(eq(campaigns.id, campaignId));
    });
    const left = await handle.db.select().from(events).where(eq(events.campaignId, campaignId));
    expect(left).toHaveLength(0);
  });
});
