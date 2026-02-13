import { Router } from "express";
import fs from "fs";
import path from "path";
import { storage } from "../storage";
import { isAuthenticated } from "../middleware/auth";
import { insertThemeSchema } from "@shared/schema";
import { themeBackgroundUpload, checkFileSignature } from "../utils/file-upload";

const router = Router();

router.get("/", isAuthenticated, async (req, res) => {
    try {
        const themes = await storage.getThemes((req.user as any).id);
        res.json(themes);
    } catch (error) {
        console.error("Error fetching themes:", error);
        res.status(500).send("Failed to fetch themes");
    }
});

router.post("/", isAuthenticated, async (req, res) => {
    try {
        const result = insertThemeSchema.safeParse(req.body);
        if (!result.success) return res.status(400).json(result.error);

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
        res.status(500).send("Failed to save theme");
    }
});

router.patch("/:id", isAuthenticated, async (req, res) => {
    try {
        const themeId = parseInt(req.params.id);
        const themes = await storage.getThemes((req.user as any).id);
        const theme = themes.find((t) => t.id === themeId);

        if (!theme) {
            return res.status(404).json({ error: "Theme not found or unauthorized" });
        }

        const result = insertThemeSchema.partial().safeParse(req.body);
        if (!result.success) return res.status(400).json(result.error);

        const updatedTheme = await storage.updateTheme(themeId, result.data);
        res.json(updatedTheme);
    } catch (error) {
        console.error("Error updating theme:", error);
        res.status(500).json({ error: "Failed to update theme" });
    }
});

router.delete("/:id", isAuthenticated, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const themes = await storage.getThemes((req.user as any).id);
        const theme = themes.find((t) => t.id === id);

        if (!theme) {
            return res.status(404).send("Theme not found or unauthorized");
        }

        if (theme.name === "Default Blue") {
            return res.status(403).send("Cannot delete the default system theme");
        }

        await storage.deleteTheme(id);
        res.sendStatus(200);
    } catch (error) {
        console.error("Error deleting theme:", error);
        res.status(500).send("Failed to delete theme");
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

        res.json({
            fileRef: req.file.filename,
            url: `/uploads/${req.file.filename}`,
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

        // Safety: only allow deleting theme-bg- prefixed files
        if (!fileRef.startsWith("theme-bg-")) {
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

        const filePath = path.join("./uploads", fileRef);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        res.sendStatus(200);
    } catch (error) {
        console.error("Error deleting theme background:", error);
        res.status(500).json({ error: "Failed to delete background image" });
    }
});

export default router;
