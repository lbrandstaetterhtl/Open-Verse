import { Router } from "express";
import rateLimit from "express-rate-limit";
import { generatePostContent } from "../services/openai";
import { isAuthenticated } from "../middleware/auth";

const router = Router();

// Dedicated AI Rate Limiter
const aiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 50, // 50 requests per minute
    message: "AI Generation rate limit exceeded. Please wait a moment."
});

// Apply limiter to all AI routes
router.use(aiLimiter);

// AI Post Generation
router.post("/generate", isAuthenticated, async (req, res) => {
    try {
        const { topic, imageContext, language } = req.body;

        if (!topic) {
            return res.status(400).send("Topic is required");
        }

        console.log(`[API] Generating AI post for user ${(req.user as any).username}`);
        const generatedContent = await generatePostContent({
            topic,
            imageContext,
            language
        });

        res.json({ content: generatedContent });
    } catch (error) {
        console.error('Error generating AI content:', error);
        res.status(500).send("Failed to generate content");
    }
});

export default router;
