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

        try {
            // 1. Check Connection
            await db.execute(sql`SELECT 1`);

            // 2. Check Tables
            // We get a list of all tables defined in our schema
            const expectedTables = Object.keys(schema).filter(key => {
                const exported = (schema as any)[key];
                return exported && typeof exported === 'object' && 'id' in exported;
            }).map(key => (schema as any)[key].tableName || key);

            // Fetch actual tables from DB
            let actualTables: string[] = [];
            const isSqlite = process.env.USE_SQLITE === "true";

            if (isSqlite) {
                const rows = await db.execute(sql`SELECT name FROM sqlite_master WHERE type='table'`) as any;
                actualTables = rows.map((r: any) => r.name);
            } else {
                const rows = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`) as any;
                actualTables = rows.map((r: any) => r.table_name);
            }

            status.missingTables = expectedTables.filter(t => !actualTables.includes(t));
            
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
