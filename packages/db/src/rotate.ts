import { eq, ne } from "drizzle-orm";
import type { Db } from "./client";
import { decryptSecret, encryptSecret, type MasterKey } from "./crypto";
import { secrets, webSessions } from "./schema/public";

/**
 * Re-encrypts every stored API key and sign-in token with the newest master
 * key (the first in MASTER_KEYS). Afterwards the older keys can be removed.
 * Runs in one transaction: it either all happens or none of it does.
 */
export async function rotateSecrets(
  db: Db,
  keys: MasterKey[],
): Promise<{ secrets: number; sessions: number }> {
  const newest = keys[0];
  if (!newest) throw new Error("MASTER_KEYS is empty");
  return db.transaction(async (tx) => {
    const oldSecrets = await tx.select().from(secrets).where(ne(secrets.keyVersion, newest.version));
    for (const s of oldSecrets) {
      const plain = decryptSecret(s, keys, s.guildId, s.id);
      const enc = encryptSecret(plain, keys, s.guildId, s.id);
      await tx
        .update(secrets)
        .set({
          ciphertext: enc.ciphertext,
          iv: enc.iv,
          tag: enc.tag,
          keyVersion: enc.keyVersion,
          updatedAt: new Date(),
        })
        .where(eq(secrets.id, s.id));
    }
    const oldSessions = await tx
      .select()
      .from(webSessions)
      .where(ne(webSessions.tokenKeyVersion, newest.version));
    for (const w of oldSessions) {
      const aad = `session:${w.id}`;
      const plain = decryptSecret(
        { ciphertext: w.tokenCiphertext, iv: w.tokenIv, tag: w.tokenTag, keyVersion: w.tokenKeyVersion },
        keys,
        null,
        aad,
      );
      const enc = encryptSecret(plain, keys, null, aad);
      await tx
        .update(webSessions)
        .set({
          tokenCiphertext: enc.ciphertext,
          tokenIv: enc.iv,
          tokenTag: enc.tag,
          tokenKeyVersion: enc.keyVersion,
        })
        .where(eq(webSessions.id, w.id));
    }
    return { secrets: oldSecrets.length, sessions: oldSessions.length };
  });
}
