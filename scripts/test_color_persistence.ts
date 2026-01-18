import { storage } from "../server/storage";
import * as fs from 'fs';

function log(message: string) {
    console.log(message);
    try {
        fs.appendFileSync('color_test_log.txt', message + '\n');
    } catch {
        // ignore
    }
}

async function main() {
    log("=== Theme Color Persistence Test ===");
    log("Started at: " + new Date().toISOString());
    log("");

    try {
        // Get user
        const user = await storage.getUserByUsername("OwnerU");
        if (!user) {
            log("ERROR: User not found");
            process.exit(1);
        }
        log(`User: ${user.username} (ID: ${user.id})`);
        log("");

        // Get test theme
        const themes = await storage.getThemes(user.id);
        let testTheme = themes.find(t => t.name === "Default Blue");

        if (!testTheme) {
            log("ERROR: Test theme 'Default Blue' not found");
            process.exit(1);
        }

        log(`Test Theme: ID ${testTheme.id}, Name: "${testTheme.name}"`);
        log("");

        // Parse current colors
        const originalColors = JSON.parse(testTheme.colors);
        log("Original colors:");
        log(`  Light primary: ${originalColors.light?.primary || 'undefined'}`);
        log(`  Dark primary: ${originalColors.dark?.primary || 'undefined'}`);
        log(`  Font: ${originalColors.font || 'undefined'}`);
        log("");

        // Modify colors
        log("Step 1: Modifying colors...");
        const modifiedColors = {
            ...originalColors,
            light: {
                ...originalColors.light,
                primary: "120 100% 50%",  // Green
                background: "0 0% 98%"
            },
            dark: {
                ...originalColors.dark,
                primary: "280 100% 70%",  // Purple
                background: "222 47% 8%"
            },
            font: "Ubuntu"
        };

        log("Modified colors:");
        log(`  Light primary: ${modifiedColors.light.primary} (changed to green)`);
        log(`  Dark primary: ${modifiedColors.dark.primary} (changed to purple)`);
        log(`  Font: ${modifiedColors.font} (changed to Ubuntu)`);
        log("");

        // Save changes
        log("Step 2: Saving changes...");
        await storage.updateTheme(testTheme.id, {
            colors: JSON.stringify(modifiedColors)
        });
        log("✓ Theme updated");
        log("");

        // Reload theme from database
        log("Step 3: Reloading theme from database...");
        const reloadedThemes = await storage.getThemes(user.id);
        const reloadedTheme = reloadedThemes.find(t => t.id === testTheme!.id);

        if (!reloadedTheme) {
            log("ERROR: Theme not found after reload");
            process.exit(1);
        }

        const savedColors = JSON.parse(reloadedTheme.colors);
        log("Saved colors from database:");
        log(`  Light primary: ${savedColors.light?.primary}`);
        log(`  Dark primary: ${savedColors.dark?.primary}`);
        log(`  Font: ${savedColors.font}`);
        log("");

        // Verify
        log("Step 4: Verifying changes...");
        let allCorrect = true;

        if (savedColors.light?.primary !== "120 100% 50%") {
            log("❌ Light primary color not saved correctly");
            log(`   Expected: "120 100% 50%", Got: "${savedColors.light?.primary}"`);
            allCorrect = false;
        } else {
            log("✓ Light primary color saved correctly");
        }

        if (savedColors.dark?.primary !== "280 100% 70%") {
            log("❌ Dark primary color not saved correctly");
            log(`   Expected: "280 100% 70%", Got: "${savedColors.dark?.primary}"`);
            allCorrect = false;
        } else {
            log("✓ Dark primary color saved correctly");
        }

        if (savedColors.font !== "Ubuntu") {
            log("❌ Font not saved correctly");
            log(`   Expected: "Ubuntu", Got: "${savedColors.font}"`);
            allCorrect = false;
        } else {
            log("✓ Font saved correctly");
        }

        log("");

        // Restore original
        log("Step 5: Restoring original colors...");
        await storage.updateTheme(testTheme.id, {
            colors: JSON.stringify(originalColors)
        });
        log("✓ Original colors restored");
        log("");

        if (allCorrect) {
            log("=== ALL COLOR PERSISTENCE TESTS PASSED ===");
            process.exit(0);
        } else {
            log("=== SOME TESTS FAILED ===");
            process.exit(1);
        }

    } catch (err) {
        log("");
        log("❌ TEST FAILED WITH ERROR:");
        log(String(err));
        if (err instanceof Error && err.stack) {
            log(err.stack);
        }
        process.exit(1);
    }
}

main();
