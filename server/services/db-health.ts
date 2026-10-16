import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";
import * as schema from "@shared/schema";

/* FEATURE [DB-005]: Database Health System.
   Ensures the database is reachable and all required tables exist. */

export interface HealthStatus {
    isHealthy: boolean;
    error?: string;
    missingTables: string[];
    details?: string;
}

export class DbHealthService {
    private static lastCheck: HealthStatus | null = null;
    private static lastCheckTime: number = 0;
    private static CHECK_INTERVAL = 30000; // 30 seconds cache

    static async checkHealth(force: boolean = false): Promise<HealthStatus> {
        const now = Date.now();
        if (!force && this.lastCheck && (now - this.lastCheckTime < this.CHECK_INTERVAL)) {
            return this.lastCheck;
        }

        const status: HealthStatus = {
            isHealthy: true,
            missingTables: []
        };

        const isSqlite = process.env.USE_SQLITE === "true";
        // The better-sqlite3 driver has no execute(); it returns rows from all() instead.
        const queryRows = async (query: ReturnType<typeof sql>): Promise<any[]> =>
            isSqlite ? db.all(query) : (await db.execute(query)).rows;

        try {
            // 1. Check Connection
            await queryRows(sql`SELECT 1`);

            // 2. Check Tables
            const expectedTables: string[] = [];
            for (const key of Object.keys(schema)) {
                const exported = (schema as any)[key];
                
                // Extract table name safely without getTableConfig
                let tableName: string | null = null;
                
                if (exported && typeof exported === 'object') {
                    // Drizzle tables have the name in these properties depending on version/dialect
                    tableName = exported.tableName || (exported as any)[Symbol.for('drizzle:Name')];
                }

                if (tableName) {
                    expectedTables.push(tableName);
                }
            }

            // Fetch actual tables from DB
            const actualTables: string[] = isSqlite
                ? (await queryRows(sql`SELECT name FROM sqlite_master WHERE type='table'`)).map((r) => r.name)
                : (await queryRows(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`)).map((r) => r.table_name);

            // In SQLite mode sessions live in the session store's own "sessions" table, not in "session".
            const notExpected = isSqlite ? ["session"] : [];
            status.missingTables = expectedTables.filter(t => !actualTables.includes(t) && !notExpected.includes(t));
            
            if (status.missingTables.length > 0) {
                status.isHealthy = false;
                status.error = "Missing database tables";
                status.details = `The following tables are missing: ${status.missingTables.join(", ")}. Please run 'npm run db:repair' on the server.`;
            }

        } catch (err: any) {
            status.isHealthy = false;
            status.error = "Database connection failed";
            status.details = err.message;
            logger.error('system', "Database Health Check Failed", err);
        }

        this.lastCheck = status;
        this.lastCheckTime = now;
        return status;
    }

    static async getDetailedMessage(status: HealthStatus, isAdmin: boolean): Promise<string> {
        if (status.isHealthy) return "";

        if (isAdmin) {
            return `DATABASE CRITICAL: ${status.error}. ${status.details}`;
        } else {
            return "We are currently experiencing technical difficulties with our database. Our engineers have been notified. Please try again in a few minutes.";
        }
    }
}
