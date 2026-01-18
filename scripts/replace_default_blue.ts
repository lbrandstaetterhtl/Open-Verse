import { storage } from "../server/storage";
import * as fs from 'fs';

function log(message: string) {
    console.log(message);
    try {
        fs.appendFileSync('replace_theme_log.txt', message + '\n');
    } catch {
        // ignore
    }
}

async function main() {
    log("=== Replacing Default Blue Theme ===");
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

        // Get all themes
        const themes = await storage.getThemes(user.id);
        log(`Found ${themes.length} theme(s):`);
        themes.forEach(t => {
            log(`  - ID: ${t.id}, Name: "${t.name}"`);
        });
        log("");

        // Find and delete old "Default Blue" theme
        const oldTheme = themes.find(t => t.name === "Default Blue");
        if (oldTheme) {
            log(`Deleting old "Default Blue" theme (ID: ${oldTheme.id})...`);
            await storage.deleteTheme(oldTheme.id);
            log("✓ Old theme deleted");
        } else {
            log("No existing 'Default Blue' theme found to delete");
        }
        log("");

        // Create new "Default Blue" theme with proper colors
        log("Creating new 'Default Blue' theme...");
        const newThemeColors = JSON.stringify({
            light: {
                background: "0 0% 100%",
                foreground: "222 47% 11%",
                card: "0 0% 100%",
                cardForeground: "222 47% 11%",
                popover: "0 0% 100%",
                popoverForeground: "222 47% 11%",
                primary: "215 70% 50%",
                primaryForeground: "0 0% 98%",
                secondary: "210 40% 96%",
                secondaryForeground: "222 47% 11%",
                muted: "210 40% 96%",
                mutedForeground: "215 16% 47%",
                accent: "210 40% 96%",
                accentForeground: "222 47% 11%",
                destructive: "0 84% 60%",
                destructiveForeground: "0 0% 98%",
                border: "214 32% 91%",
                input: "214 32% 91%",
                ring: "215 70% 50%"
            },
            dark: {
                background: "222 47% 11%",
                foreground: "210 40% 98%",
                card: "222 47% 11%",
                cardForeground: "210 40% 98%",
                popover: "222 47% 11%",
                popoverForeground: "210 40% 98%",
                primary: "217 91% 60%",
                primaryForeground: "222 47% 11%",
                secondary: "217 33% 17%",
                secondaryForeground: "210 40% 98%",
                muted: "217 33% 17%",
                mutedForeground: "215 20% 65%",
                accent: "217 33% 17%",
                accentForeground: "210 40% 98%",
                destructive: "0 62% 30%",
                destructiveForeground: "210 40% 98%",
                border: "217 33% 17%",
                input: "217 33% 17%",
                ring: "217 91% 60%"
            },
            font: "Inter"
        });

        const newTheme = await storage.createTheme(user.id, {
            name: "Default Blue",
            colors: newThemeColors
        });

        log(`✓ New theme created (ID: ${newTheme.id})`);
        log("");

        // Verify
        log("Verifying...");
        const finalThemes = await storage.getThemes(user.id);
        const verifyTheme = finalThemes.find(t => t.name === "Default Blue");

        if (verifyTheme) {
            log(`✓ "Default Blue" theme exists (ID: ${verifyTheme.id})`);
            const colors = JSON.parse(verifyTheme.colors);
            log(`  Font: ${colors.font}`);
            log(`  Light primary: ${colors.light?.primary}`);
            log(`  Dark primary: ${colors.dark?.primary}`);
        } else {
            log("ERROR: Could not verify theme creation");
            process.exit(1);
        }
        log("");

        log("=== REPLACEMENT COMPLETE ===");

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
