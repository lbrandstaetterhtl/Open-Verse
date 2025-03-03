import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL environment variable. Please configure it in the Deployments pane.");
  process.exit(1);
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
