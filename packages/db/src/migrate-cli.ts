import { connect, runMigrations } from "./client";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

/** What to do about the usual reasons migrations can't run; the pg error's code may sit on its cause. */
function advice(e: unknown): string {
  const err = e as { code?: string; cause?: { code?: string } };
  const code = err.cause?.code ?? err.code;
  if (code === "28P01")
    return (
      "Postgres refused the password. It keeps the one it was given when its database volume was first created, so\n" +
      "POSTGRES_PASSWORD in .env must still be that one. Put it back, or start the database afresh with\n" +
      "`docker compose -f docker-compose.prod.yml down -v`, which deletes its data."
    );
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EAI_AGAIN")
    return "Postgres couldn't be reached: check the host and port in DATABASE_URL, and that the database is running.";
  return "";
}

const handle = connect(url, { max: 1 });
try {
  await runMigrations(handle.db);
  console.log("migrations applied");
} catch (e) {
  const err = e as Error & { cause?: Error };
  const reason = err.cause?.message ?? err.message;
  console.error(`migrations failed: ${reason}`);
  const what = advice(e);
  if (what) console.error(what);
  process.exitCode = 1;
} finally {
  await handle.close();
}
