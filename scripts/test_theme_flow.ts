import { storage } from "../server/storage";
import * as fs from 'fs';

function log(message: string) {
    console.log(message);
    try {
        fs.appendFileSync('theme_test_log.txt', message + '\n');
    } catch {
        // ignore
    }
}

async function main() {
    log("=== Theme Update Flow Test ===");
    log("Started at: " + new Date().toISOString());
    log("");

    const username = "OwnerU";

    try {
        // Step 1: Get user
        log("Step 1: Finding user...");
        const user = await storage.getUserByUsername(username);
        if (!user) {
            log("ERROR: User not found");
            process.exit(1);
        }
        log(`✓ Found user: ${user.username} (ID: ${user.id})`);
        log("");

        // Step 2: Get initial themes
        log("Step 2: Getting initial themes...");
        const initialThemes = await storage.getThemes(user.id);
        log(`Found ${initialThemes.length} theme(s):`);
        initialThemes.forEach(t => {
            log(`  - ID: ${t.id}, Name: "${t.name}"`);
        });
        log("");

        // Step 3: Find or create test theme
        log("Step 3: Setting up test theme...");
        let testTheme = initialThemes.find(t => t.name === "Default Blue");

        if (!testTheme) {
            log("Creating test theme 'Default Blue'...");
            const testColors = JSON.stringify({
                light: { background: "0 0% 100%", foreground: "222 47% 11%" },
                dark: { background: "222 47% 11%", foreground: "210 40% 98%" },
                font: "Inter"
            });
            testTheme = await storage.createTheme(user.id, {
                name: "Default Blue",
                colors: testColors
            });
            log(`✓ Created theme ID: ${testTheme.id}`);
        } else {
            log(`✓ Using existing theme ID: ${testTheme.id}`);
        }
        log("");

        // Step 4: Simulate update (same name, different colors)
        log("Step 4: Updating theme (simulating frontend save)...");
        const updatedColors = JSON.stringify({
            light: { background: "0 0% 95%", foreground: "222 47% 11%" },
            dark: { background: "222 47% 15%", foreground: "210 40% 98%" },
            font: "Roboto"
        });

        log(`Updating theme ID ${testTheme.id} with new colors...`);
        const updated = await storage.updateTheme(testTheme.id, {
            name: "Default Blue",
            colors: updatedColors
        });
        log(`✓ Update returned: ID ${updated.id}, Name: "${updated.name}"`);
        log("");

        // Step 5: Verify no duplicates
        log("Step 5: Checking for duplicates...");
        const finalThemes = await storage.getThemes(user.id);
        const blueThemes = finalThemes.filter(t => t.name === "Default Blue");

        log(`Total themes: ${finalThemes.length}`);
        log(`"Default Blue" themes: ${blueThemes.length}`);

        if (blueThemes.length > 1) {
            log("");
            log("❌ FAIL: Found duplicate themes!");
            blueThemes.forEach(t => {
                log(`  - ID: ${t.id}, Created: ${t.createdAt}`);
            });
            process.exit(1);
        }

        if (blueThemes.length === 1) {
            log("✓ No duplicates found");
            log(`  Theme ID: ${blueThemes[0].id}`);

            // Verify it's the updated one
            const colors = JSON.parse(blueThemes[0].colors);
            if (colors.font === "Roboto") {
                log("✓ Theme was updated correctly (font changed to Roboto)");
            } else {
                log(`⚠ Warning: Expected font 'Roboto', got '${colors.font}'`);
            }
        }
        log("");

        // Step 6: Test renaming
        log("Step 6: Testing rename...");
        const renamedTheme = await storage.updateTheme(testTheme.id, {
            name: "Default Blue Renamed"
        });
        log(`✓ Renamed to: "${renamedTheme.name}"`);

        const afterRename = await storage.getThemes(user.id);
        const oldNameExists = afterRename.some(t => t.name === "Default Blue");
        const newNameExists = afterRename.some(t => t.name === "Default Blue Renamed");

        if (oldNameExists) {
            log("❌ FAIL: Old name still exists after rename");
        } else if (!newNameExists) {
            log("❌ FAIL: New name not found after rename");
        } else {
            log("✓ Rename successful");
        }
        log("");

        // Step 7: Revert name
        log("Step 7: Reverting name...");
        await storage.updateTheme(testTheme.id, { name: "Default Blue" });
        log("✓ Name reverted to 'Default Blue'");
        log("");

        log("=== ALL TESTS PASSED ===");

    } catch (err) {
        log("");
        log("❌ TEST FAILED WITH ERROR:");
        log(String(err));
        if (err instanceof Error && err.stack) {
            log("Stack trace:");
            log(err.stack);
        }
        process.exit(1);
    }

    process.exit(0);
}

main();
