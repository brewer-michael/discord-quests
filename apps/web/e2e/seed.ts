/**
 * Prepares a fresh database for the end-to-end run: one signed-in admin,
 * two servers they manage (one with the bot), one they don't, and an
 * Assist-mode campaign with a planted thread for the hidden-hand page.
 */
import { createHash } from "node:crypto";
import { connect, guilds, runMigrations, webSessions } from "@dq/db";
import { encryptSecret, parseMasterKeys } from "@dq/db/crypto";
import { createEngine, WorldCache } from "@dq/engine";
import { UnconfiguredLlm } from "@dq/engine/testing";
import pg from "pg";
import { e2eDatabaseUrl, GUILD_ID, MASTER_KEYS, OTHER_GUILD_ID, SESSION_TOKEN, USER_ID } from "./fixtures";

const url = new URL(e2eDatabaseUrl());
const admin = new pg.Client({
  connectionString: Object.assign(new URL(url), { pathname: "/postgres" }).toString(),
});
await admin.connect();
await admin.query("DROP DATABASE IF EXISTS dq_e2e WITH (FORCE)");
await admin.query("CREATE DATABASE dq_e2e");
await admin.end();

const handle = connect(url.toString(), { max: 2 });
await runMigrations(handle.db);
const keys = parseMasterKeys(MASTER_KEYS);
const id = createHash("sha256").update(SESSION_TOKEN).digest("hex");
const enc = encryptSecret("e2e-discord-access-token", keys, null, `session:${id}`);
await handle.db.insert(webSessions).values({
  id,
  userId: USER_ID,
  username: "Test Admin",
  avatar: null,
  tokenCiphertext: enc.ciphertext,
  tokenIv: enc.iv,
  tokenTag: enc.tag,
  tokenKeyVersion: enc.keyVersion,
  guilds: [
    { id: GUILD_ID, name: "Lantern Club", icon: null, owner: true, permissions: "0" },
    { id: OTHER_GUILD_ID, name: "Homework Help", icon: null, owner: false, permissions: String(0x20) },
    { id: "200000000000000009", name: "Just a member", icon: null, owner: false, permissions: "1024" },
  ],
  guildsFetchedAt: new Date(Date.now() + 3600_000),
  expiresAt: new Date(Date.now() + 24 * 3600_000),
});
await handle.db.insert(guilds).values({ id: GUILD_ID, name: "Lantern Club", botPresent: true });

const engine = createEngine({ db: handle.db, worlds: new WorldCache(), llm: new UnconfiguredLlm() });
const c = await engine.campaigns.create({
  guildId: GUILD_ID,
  guildName: "Lantern Club",
  channelId: "400000000000000001",
  name: "Lights Out",
  mode: "assist",
  createdBy: USER_ID,
  dmUserId: USER_ID,
});
await engine.dm.plant(c.id, USER_ID, {
  tag: "mercy",
  npcId: "snibbet",
  summary: "Let the lantern-thief go free",
  size: "large",
});
await handle.close();
console.log("e2e database ready");
