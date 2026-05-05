import { DbHealthService } from "../server/services/db-health";

async function check() {
    console.log("\n🔍 Starting Database Health Check...");
    const status = await DbHealthService.checkHealth(true);

    if (status.isHealthy) {
        console.log("✅ Database status: HEALTHY");
        console.log("All required tables are present and connection is stable.");
    } else {
        console.log("❌ Database status: UNHEALTHY");
        console.log(`Error: ${status.error}`);
        if (status.missingTables.length > 0) {
            console.log(`Missing Tables: ${status.missingTables.join(", ")}`);
            console.log("\n👉 Run 'npm run db:repair' for details.");
        }
    }
    process.exit(status.isHealthy ? 0 : 1);
}

check().catch(console.error);
