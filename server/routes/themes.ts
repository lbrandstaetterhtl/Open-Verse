import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { storage } from "../storage";
import { isAuthenticated } from "../middleware/auth";
import { insertThemeSchema } from "@shared/schema";
import { themeBackgroundUpload, checkFileSignature, sanitizeImage } from "../utils/file-upload";

import { sendValidationError } from "../utils/http-errors";
import { validateIdParams } from "../utils/params";
import { isPlainBody } from "../utils/admin-input";
const router = Router();

validateIdParams(router, ["id"]);

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
/**
 * Background files carry their owner: theme-bg-u<userId>-<timestamp>-<random>.<ext>. Older files without the
 * owner part cannot be deleted through the API (nobody can prove they own them).
 */
const OWNED_BG = /^theme-bg-u([1-9]\d{0,9})-\d{1,15}-\d{1,12}\.(?:png|jpe?g|gif|webp)$/;

router.get("/", isAuthenticated, async (req, res) => {
    try {
        const themes = await storage.getThemes((req.user as any).id);
        res.json(themes);
    } catch (error) {
        console.error("Error fetching themes:", error);
        res.status(500).json({ error: "Failed to fetch themes" });
    }
});

router.post("/", isAuthenticated, async (req, res) => {
    try {
        const result = insertThemeSchema.safeParse(req.body);
        if (!result.success) {
            console.error("[Themes] Validation failed:", result.error.flatten());
            return sendValidationError(res, result.error);
        }

        const userThemes = await storage.getThemes((req.user as any).id);
        const existingTheme = userThemes.find((t) => t.name.trim() === result.data.name.trim());

        if (existingTheme) {
            const updatedTheme = await storage.updateTheme(existingTheme.id, result.data);
            return res.json(updatedTheme);
        }

        const theme = await storage.createTheme((req.user as any).id, result.data);
        res.json(theme);
    } catch (error) {
        console.error("Error creating/updating theme:", error);
        res.status(500).json({ error: "Failed to save theme" });
    }
});

router.patch("/:id", isAuthenticated, async (req, res) => {
    try {
        const themeId = Number(req.params.id);
        const themes = await storage.getThemes((req.user as any).id);
        const theme = themes.find((t) => t.id === themeId);

        if (!theme) {
            return res.status(404).json({ error: "Theme not found or unauthorized" });
        }

        const result = insertThemeSchema.partial().safeParse(isPlainBody(req.body) ? req.body : null);
        if (!result.success) {
            return sendValidationError(res, result.error);
        }
        const update = Object.fromEntries(Object.entries(result.data).filter(([, v]) => v !== undefined));
        if (Object.keys(update).length === 0) {
            return res.status(400).json({ error: "No valid fields provided for update" });
        }
        if (update.name && themes.some((t) => t.id !== themeId && t.name.trim() === update.name)) {
            return res.status(409).json({ error: "A theme with this name already exists", code: "THEME_NAME_TAKEN" });
        }

        const updatedTheme = await storage.updateTheme(themeId, update);
        res.json(updatedTheme);
    } catch (error) {
        console.error("Error updating theme:", error);
        res.status(500).json({ error: "Failed to update theme" });
    }
});

router.delete("/:id", isAuthenticated, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const themes = await storage.getThemes((req.user as any).id);
        const theme = themes.find((t) => t.id === id);

        if (!theme) {
            return res.status(404).json({ error: "Theme not found or unauthorized" });
        }

        if (theme.name === "Default Blue") {
            return res.status(403).json({ error: "Cannot delete the default system theme" });
        }

        await storage.deleteTheme(id);
        res.sendStatus(200);
    } catch (error) {
        console.error("Error deleting theme:", error);
        res.status(500).json({ error: "Failed to delete theme" });
    }
});

// --- Background image upload ---

router.post("/background", isAuthenticated, themeBackgroundUpload.single("background"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded or invalid file type" });
        }

        // Verify file signature matches claimed MIME type
        const sigValid = await checkFileSignature(req.file.path, req.file.mimetype);
        if (!sigValid) {
            // Remove the uploaded file
            console.error(`File signature mismatch for ${req.file.originalname} (${req.file.mimetype})`);
            fs.unlink(req.file.path, () => { });
            return res.status(400).json({ error: "File signature mismatch - ensure file matches its extension" });
        }

        // SEC-003: Sanitize background image (only for images)
        if (req.file.mimetype.startsWith('image/')) {
            try {
                await sanitizeImage(req.file.path);
            } catch (error) {
                console.error("Theme background sanitization failed:", error);
                fs.unlink(req.file.path, () => { });
                return res.status(400).json({ error: "Failed to process background image metadata" });
            }
        }

        // Record the owner in the file name so only they can delete it later.
        const ownedName = req.file.filename.replace(/^theme-bg-/, `theme-bg-u${(req.user as any).id}-`);
        if (!OWNED_BG.test(ownedName)) {
            fs.unlink(req.file.path, () => { });
            return res.status(400).json({ error: "No file uploaded or invalid file type" });
        }
        await fs.promises.rename(req.file.path, path.join(UPLOADS_DIR, ownedName));

        res.json({
            fileRef: ownedName,
            url: `/uploads/${ownedName}`,
        });
    } catch (error) {
        console.error("Error uploading theme background:", error);
        res.status(500).json({ error: "Failed to upload background image" });
    }
});

router.delete("/background/:fileRef", isAuthenticated, async (req, res) => {
    try {
        const { fileRef } = req.params;
        const userId = (req.user as any).id;

        // Safety: strict file-name pattern (no "/", "\\" or ".."), the caller must own the file, and the
        // resolved path must stay inside the uploads folder.
        const m = typeof fileRef === "string" ? OWNED_BG.exec(fileRef) : null;
        if (!m) {
            return res.status(400).json({ error: "Invalid file reference" });
        }
        if (Number(m[1]) !== userId) {
            return res.status(403).json({ error: "You can only delete your own background images", code: "NOT_FILE_OWNER" });
        }
        const filePath = path.resolve(UPLOADS_DIR, fileRef);
        if (path.dirname(filePath) !== UPLOADS_DIR) {
            return res.status(400).json({ error: "Invalid file reference" });
        }

        // Check if any of this user's themes still reference this fileRef
        const userThemes = await storage.getThemes(userId);
        const isReferenced = userThemes.some((t) => {
            try {
                const colors = JSON.parse(t.colors);
                return colors.background?.image?.value === fileRef;
            } catch {
                return false;
            }
        });

        if (isReferenced) {
            return res.status(409).json({ error: "File is still referenced by a theme" });
        }

        await fs.promises.unlink(filePath).catch((err) => {
            if (err?.code !== "ENOENT") throw err;
        });

        res.sendStatus(200);
    } catch (error) {
        console.error("Error deleting theme background:", error);
        res.status(500).json({ error: "Failed to delete background image" });
    }
});

export default router;
