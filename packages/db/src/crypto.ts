import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption for provider API keys. The ciphertext is bound to its
 * row (guild and secret id) through additional authenticated data, so a key
 * copied into another row will not decrypt.
 */

export interface MasterKey {
  version: string;
  key: Buffer;
}

export interface EncryptedSecret {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
  keyVersion: string;
  last4: string;
}

/** Parses MASTER_KEYS="v2:<base64>,v1:<base64>" (newest first). */
export function parseMasterKeys(value: string | undefined): MasterKey[] {
  if (!value) throw new Error("MASTER_KEYS is not set");
  const keys = value.split(",").map((part) => {
    const [version, b64] = part.trim().split(":");
    if (!version || !b64) throw new Error("MASTER_KEYS entries look like v1:<base64>");
    const key = Buffer.from(b64, "base64");
    if (key.length !== 32) throw new Error(`master key ${version} must be 32 bytes`);
    return { version, key };
  });
  if (keys.length === 0) throw new Error("MASTER_KEYS is empty");
  return keys;
}

export function secretAad(guildId: string | null, secretId: string, keyVersion: string): Buffer {
  return Buffer.from(`guild:${guildId ?? "platform"}|secret:${secretId}|${keyVersion}`);
}

export function encryptSecret(
  plaintext: string,
  keys: MasterKey[],
  guildId: string | null,
  secretId: string,
): EncryptedSecret {
  const master = keys[0];
  if (!master) throw new Error("no master key");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", master.key, iv);
  cipher.setAAD(secretAad(guildId, secretId, master.version));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag(), keyVersion: master.version, last4: plaintext.slice(-4) };
}

export function decryptSecret(
  enc: Pick<EncryptedSecret, "ciphertext" | "iv" | "tag" | "keyVersion">,
  keys: MasterKey[],
  guildId: string | null,
  secretId: string,
): string {
  const master = keys.find((k) => k.version === enc.keyVersion);
  if (!master) throw new Error(`master key ${enc.keyVersion} is not configured`);
  const decipher = createDecipheriv("aes-256-gcm", master.key, enc.iv);
  decipher.setAAD(secretAad(guildId, secretId, enc.keyVersion));
  decipher.setAuthTag(enc.tag);
  return Buffer.concat([decipher.update(enc.ciphertext), decipher.final()]).toString("utf8");
}

/** Shown in the setup page instead of the key: "•••• abcd". */
export function maskSecret(last4: string): string {
  return `•••• ${last4}`;
}
