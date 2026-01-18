import { storage } from "../server/storage";
import * as fs from 'fs';

function log(message: string) {
    console.log(message);
    try {
        fs.appendFileSync('cleanup_log.txt', message + '\n');
    } catch {
        // ignore
    }
}

async function main() {
    log("--- Inspection run at " + new Date().toISOString() + " ---");

    const username = "OwnerU";

    try {
        const user = await storage.getUserByUsername(username);

        if (!user) {
            log(`User '${username}' not found.`);
            process.exit(1);
        }

        log(`Found user: ${user.username} (ID: ${user.id})`);

        const themes = await storage.getThemes(user.id);
        log(`Found ${themes.length} themes for user:`);

        themes.forEach(t => {
            log(` - ID: ${t.id}, Name: '${t.name}', Created: ${t.createdAt}`);
        });

    } catch (err) {
        log("Error: " + err);
    }

    process.exit(0);
}

main();
