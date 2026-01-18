import { storage } from "../server/storage";
import * as fs from 'fs';

function log(message: string) {
    console.log(message);
    try {
        fs.appendFileSync('cleanup_v2_log.txt', message + '\n');
    } catch {
        // ignore
    }
}

async function main() {
    log("--- Cleanup V2 run at " + new Date().toISOString() + " ---");

    const username = "OwnerU";

    try {
        const user = await storage.getUserByUsername(username);

        if (!user) {
            log(`User '${username}' not found.`);
            process.exit(1);
        }

        log(`Found user: ${user.username} (ID: ${user.id})`);

        const themes = await storage.getThemes(user.id);
        log(`Found ${themes.length} themes for user.`);

        const targetName = "Default Blue";
        const duplicateThemes = themes.filter(t => t.name.trim() === targetName);

        log(`Found ${duplicateThemes.length} themes with name '${targetName}':`);
        duplicateThemes.forEach(t => {
            log(` - ID: ${t.id}, Created At: ${t.createdAt}`);
        });

        if (duplicateThemes.length <= 1) {
            log("No duplicates found to delete.");
            process.exit(0);
        }

        // Sort by ID descending (newest first)
        duplicateThemes.sort((a, b) => b.id - a.id);

        const themeToDelete = duplicateThemes[0];
        log(`Deleting duplicate theme ID: ${themeToDelete.id} (Created: ${themeToDelete.createdAt})`);

        await storage.deleteTheme(themeToDelete.id);
        log("Successfully deleted theme.");

    } catch (err) {
        log("Error: " + err);
        process.exit(1);
    }

    process.exit(0);
}

main();
