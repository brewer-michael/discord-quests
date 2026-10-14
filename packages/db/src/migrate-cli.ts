import { connect, runMigrations } from "./client";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const handle = connect(url, { max: 1 });
await runMigrations(handle.db);
await handle.close();
console.log("migrations applied");
