import { randomBytes } from "node:crypto";
import pg from "pg";
import { connect, type DbHandle, runMigrations } from "./client";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

/**
 * A fresh, migrated database for one test file. Requires TEST_DATABASE_URL
 * pointing at a server where the user may create databases.
 */
export async function createTestDb(): Promise<DbHandle & { url: string; drop(): Promise<void> }> {
  if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is not set");
  const name = `dq_t_${randomBytes(6).toString("hex")}`;
  const admin = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${name}`;
  const handle = connect(url.toString(), { max: 5 });
  await runMigrations(handle.db);
  return {
    ...handle,
    url: url.toString(),
    async drop() {
      await handle.close();
      const a = new pg.Client({ connectionString: TEST_DATABASE_URL });
      await a.connect();
      await a.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await a.end();
    },
  };
}
