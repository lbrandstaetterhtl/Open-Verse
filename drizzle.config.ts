import { defineConfig } from "drizzle-kit";

const useSqlite = process.env.USE_SQLITE === "true";

if (!useSqlite && !process.env.DATABASE_URL) {
  console.error(
    "Missing DATABASE_URL environment variable. Please configure it in the Deployments pane.",
  );
  process.exit(1);
}

console.log(useSqlite ? "Drizzle configured for SQLite" : "Drizzle configured for PostgreSQL");

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: useSqlite ? "sqlite" : "postgresql",
  dbCredentials: useSqlite ? { url: "local.db" } : { url: process.env.DATABASE_URL! },
});
