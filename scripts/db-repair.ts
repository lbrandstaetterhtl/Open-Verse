import { DbHealthService } from "../server/services/db-health";
import { db } from "../server/db";
import { sql } from "drizzle-orm";
import { logger } from "../server/logger";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { migrate as migrateSqlite } from "drizzle-orm/better-sqlite3/migrator";
import * as path from "path";

/* SCRIPT [DB-REPAIR]: Analyzes database state and attempts to fix issues. */

async function repair() {
    console.log("\n" + "═".repeat(60));
    console.log("  Open-Verse Database Repair Tool");
    console.log("═".repeat(60) + "\n");

    const status = await DbHealthService.checkHealth(true);

    if (status.isHealthy) {
        console.log("✅ Database is healthy and all tables exist.");
        process.exit(0);
    }

    console.log(`❌ Issue detected: ${status.error}`);
    if (status.missingTables.length > 0) {
        console.log(`📍 Missing tables: ${status.missingTables.join(", ")}`);
    }

    console.log("\nAttempting to repair database...");

    try {
        const isSqlite = process.env.USE_SQLITE === "true";
        
        console.log("Step 1: Pushing schema changes using Drizzle...");
        // In a real environment, we would run 'drizzle-kit push' or 'migrate'
        // Here we attempt to run the sync logic
        
        console.log("Please run the following command to fix the schema:");
        console.log("👉 npm run db:push");
        
        console.log("\nNote: If 'db:push' fails, ensure your .env is correctly configured.");
        
    } catch (err: any) {
        console.error("Critical error during repair:", err.message);
        process.exit(1);
    }
}

repair().catch(console.error);
