import { Router } from "express";
import rateLimit from "express-rate-limit";
import { generatePostContent } from "../services/openai";
import { isAuthenticated } from "../middleware/auth";
import { z } from "zod";
import { text } from "../utils/admin-input";
import { sendValidationError } from "../utils/http-errors";

const generateSchema = z.object({
    topic: text(500, 1),
    // Interpolated into the system prompt: a language name only (e.g. "english", "Deutsch", "pt-BR").
    language: z.string().trim().regex(/^[A-Za-z\u00C0-\u024F -]{2,30}$/, "Invalid format").optional(),
    imageContext: z.union([z.string().max(15_000_000), z.null()]).optional(),
});

const router = Router();

// Dedicated AI Rate Limiter
const aiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 50, // 50 requests per minute
    standardHeaders: false,
    legacyHeaders: false,
    message: { error: "AI Generation rate limit exceeded. Please wait a moment." }
});

// Apply limiter to all AI routes
router.use(aiLimiter);

import { SettingsService } from "../services/settings";

// AI Post Generation
router.post("/generate", isAuthenticated, async (req, res) => {
    try {
        const isAiEnabled = await SettingsService.get("content", "ai_generation_enabled", true);
        if (!isAiEnabled) {
            return res.status(403).json({ error: "AI Generation is currently disabled by simple site policy." });
        }
        const parsed = generateSchema.safeParse(req.body);
        if (!parsed.success) return sendValidationError(res, parsed.error);
        const { topic, imageContext, language } = parsed.data;

        console.log(`[API] Generating AI post for user ${(req.user as any).username}`);
        const generatedContent = await generatePostContent({
            topic,
            imageContext: imageContext ?? undefined,
            language
        });

        res.json({ content: generatedContent });
    } catch (error) {
        console.error('Error generating AI content:', error);
        res.status(500).json({ error: "Failed to generate content" });
    }
});

export default router;
