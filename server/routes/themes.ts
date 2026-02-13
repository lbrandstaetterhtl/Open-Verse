import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../middleware/auth";
import { insertThemeSchema } from "@shared/schema";

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

export default router;
