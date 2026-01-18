import { storage } from "../server/storage";
import * as fs from 'fs';

function log(message: string) {
    console.log(message);
    try {
        fs.appendFileSync('test_update_log.txt', message + '\n');
    } catch {
        // ignore
    }
}

async function main() {
    log("--- Test Update Run ---");

    const username = "OwnerU";
    const user = await storage.getUserByUsername(username);
    if (!user) {
        log("OwnerU not found");
        process.exit(1);
    }

    const themes = await storage.getThemes(user.id);
    const theme = themes.find(t => t.name.includes("Default Blue"));
    // Should find ID 19 based on previous logs

    if (!theme) {
        log("Theme 'Default Blue' not found");
        process.exit(1);
    }

    log(`Found theme ID: ${theme.id}, Name: ${theme.name}`);

    // Try to update
    const newName = "Default Blue Updated";
    log(`Attempting to update name to '${newName}'...`);

    try {
        const updated = await storage.updateTheme(theme.id, { name: newName });
        log(`Update successful! New name: ${updated.name}`);

        if (updated.name !== newName) {
            log("ERROR: Returned name does not match requested name.");
        }

        // Revert
        log("Reverting name...");
        await storage.updateTheme(theme.id, { name: "Default Blue" });
        log("Reverted successfully.");

    } catch (err) {
        log("Update FAILED with error: " + err);
        if (err instanceof Error) {
            log("Stack: " + err.stack);
        }
    }

    process.exit(0);
}

main();
