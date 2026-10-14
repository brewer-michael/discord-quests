import { createHash, randomBytes } from "node:crypto";
import { type DbOrTx, type SessionGuild, webSessions } from "@dq/db";
import { decryptSecret, encryptSecret, type MasterKey } from "@dq/db/crypto";
import { eq, lt } from "drizzle-orm";

export const SESSION_COOKIE = "dq_session";
export const STATE_COOKIE = "dq_oauth_state";
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;
/** How long a server list (and the permissions in it) is trusted before asking Discord again. */
export const GUILDS_FRESH_MS = 5 * 60 * 1000;

export type Session = typeof webSessions.$inferSelect;

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The session id doubles as the encryption context, so a token can't be moved to another session. */
function tokenAadId(sessionId: string) {
  return `session:${sessionId}`;
}

export async function createSession(
  db: DbOrTx,
  keys: MasterKey[],
  input: {
    user: { id: string; username: string; avatar: string | null };
    accessToken: string;
    expiresInSeconds: number;
    guilds: SessionGuild[];
  },
  now = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const id = hashToken(token);
  const enc = encryptSecret(input.accessToken, keys, null, tokenAadId(id));
  const expiresAt = new Date(now.getTime() + Math.min(MAX_AGE_MS, input.expiresInSeconds * 1000));
  await db.delete(webSessions).where(lt(webSessions.expiresAt, now));
  await db.insert(webSessions).values({
    id,
    userId: input.user.id,
    username: input.user.username,
    avatar: input.user.avatar,
    tokenCiphertext: enc.ciphertext,
    tokenIv: enc.iv,
    tokenTag: enc.tag,
    tokenKeyVersion: enc.keyVersion,
    guilds: input.guilds,
    guildsFetchedAt: now,
    expiresAt,
  });
  return { token, expiresAt };
}

export async function findSession(db: DbOrTx, token: string | undefined, now = new Date()) {
  if (!token || token.length > 100) return null;
  const [row] = await db
    .select()
    .from(webSessions)
    .where(eq(webSessions.id, hashToken(token)));
  if (!row) return null;
  if (row.expiresAt <= now) {
    await db.delete(webSessions).where(eq(webSessions.id, row.id));
    return null;
  }
  return row;
}

export function sessionAccessToken(row: Session, keys: MasterKey[]): string {
  return decryptSecret(
    { ciphertext: row.tokenCiphertext, iv: row.tokenIv, tag: row.tokenTag, keyVersion: row.tokenKeyVersion },
    keys,
    null,
    tokenAadId(row.id),
  );
}

export async function updateSessionGuilds(db: DbOrTx, id: string, guilds: SessionGuild[], now = new Date()) {
  await db.update(webSessions).set({ guilds, guildsFetchedAt: now }).where(eq(webSessions.id, id));
}

export async function deleteSession(db: DbOrTx, token: string | undefined) {
  if (token) await db.delete(webSessions).where(eq(webSessions.id, hashToken(token)));
}
