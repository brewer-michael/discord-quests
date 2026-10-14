import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  schemaFilter: ["public", "spoiler", "loom"],
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://dq:dq@localhost:5432/dq" },
});
