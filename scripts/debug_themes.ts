import { storage } from "../server/storage";
import * as fs from 'fs';

function log(message: string) {
    console.log(message);
    try {
        fs.appendFileSync('theme_debug_log.txt', message + '\n');
    } catch {
        // ignore
    }
}

async function main() {
    log("=== Theme Debugging ===");
    log("Started at: " + new Date().toISOString());
    log("");

    try {
        const user = await storage.getUserByUsername("OwnerU");
        if (!user) {
            log("ERROR: User not found");
            process.exit(1);
        }
        log(`User: ${user.username} (ID: ${user.id})`);
        log("");

        // Get all themes from database
        const themes = await storage.getThemes(user.id);
        log(`Total themes in database: ${themes.length}`);
        themes.forEach(t => {
            log(`  - ID: ${t.id}, Name: "${t.name}", Created: ${t.createdAt}`);
        });
        log("");

        // Find "Default Blue" and "My Custom Theme"
        const defaultBlue = themes.filter(t => t.name === "Default Blue");
        const customThemes = themes.filter(t => t.name === "My Custom Theme");

        log(`"Default Blue" themes: ${defaultBlue.length}`);
        defaultBlue.forEach(t => {
            const colors = JSON.parse(t.colors);
            log(`  - ID: ${t.id}, Primary (light): ${colors.light?.primary}`);
        });
        log("");

        log(`"My Custom Theme" themes: ${customThemes.length}`);
        customThemes.forEach(t => {
            const colors = JSON.parse(t.colors);
            log(`  - ID: ${t.id}, Primary (light): ${colors.light?.primary}, Created: ${t.createdAt}`);
        });
        log("");

        log("Expected behavior:");
        log("- If savedThemeAs was called with ID 16 (from localStorage),");
        log("  it should have updated theme ID 16");
        log("");

        if (customThemes.length > 0) {
            log("⚠️ PROBLEM DETECTED: 'My Custom Theme' entries exist");
            log("This means saveThemeAs created NEW themes instead of updating existing one");
        }

    } catch (err) {
        log("");
        log("❌ ERROR:");
        log(String(err));
        if (err instanceof Error && err.stack) {
            log(err.stack);
        }
        process.exit(1);
    }

    process.exit(0);
}

main();
