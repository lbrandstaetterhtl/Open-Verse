import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../middleware/auth";
import { insertCommunitySchema } from "@shared/schema";

const router = Router();

router.get("/", async (req, res) => {
    try {
        const communities = await storage.getCommunities();
        res.json(communities);
    } catch (error) {
        console.error("Error fetching communities:", error);
        res.status(500).send("Failed to fetch communities");
    }
});

router.post("/", isAuthenticated, async (req, res) => {
    try {
        const userRole = (req.user as any).role;
        const userKarma = (req.user as any).karma;

        if (userRole !== "admin" && userRole !== "owner" && userKarma < 200) {
            return res.status(403).send("You need at least 200 reputation to create a community.");
        }

        const result = insertCommunitySchema.safeParse(req.body);
        if (!result.success) return res.status(400).json(result.error);

        const slug = result.data.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");

        const existing = await storage.getCommunityBySlug(slug);
        if (existing) {
            return res.status(400).send("A community with this name already exists.");
        }

        const community = await storage.createCommunity({
            ...result.data,
            creatorId: (req.user as any).id,
            slug,
        });

        res.status(201).json(community);
    } catch (error) {
        console.error("Error creating community:", error);
        res.status(500).send("Failed to create community");
    }
});

router.get("/:slug", async (req, res) => {
    try {
        const community = await storage.getCommunityBySlug(req.params.slug);
        if (!community) return res.status(404).send("Community not found");

        let memberInfo = null;
        if (req.isAuthenticated()) {
            const member = await storage.getCommunityMember(community.id, (req.user as any).id);
            if (member) {
                memberInfo = { role: member.role, joinedAt: member.joinedAt };
            }
        }

        res.json({ ...community, memberInfo });
    } catch (error) {
        console.error("Error fetching community:", error);
        res.status(500).send("Failed to fetch community");
    }
});

router.post("/:id/join", isAuthenticated, async (req, res) => {
    try {
        const communityId = parseInt(req.params.id);
        const userId = (req.user as any).id;

        const community = await storage.getCommunity(communityId);
        if (!community) return res.status(404).send("Community not found");

        const isBanned = await storage.isUserBannedFromCommunity(communityId, userId);
        if (isBanned) return res.status(403).send("You are banned from this community.");

        const existingMember = await storage.getCommunityMember(communityId, userId);
        if (existingMember) return res.status(400).send("Already a member");

        await storage.addCommunityMember(communityId, userId, "member");
        res.sendStatus(200);
    } catch (error) {
        console.error("Error joining community:", error);
        res.status(500).send("Failed to join community");
    }
});

router.post("/:id/leave", isAuthenticated, async (req, res) => {
    try {
        const communityId = parseInt(req.params.id);
        const userId = (req.user as any).id;

        const member = await storage.getCommunityMember(communityId, userId);
        if (!member) return res.status(400).send("Not a member");

        if (member.role === "owner") {
            return res.status(400).send("Owner cannot leave the community. Transfer ownership first.");
        }

        await storage.removeCommunityMember(communityId, userId);
        res.sendStatus(200);
    } catch (error) {
        console.error("Error leaving community:", error);
        res.status(500).send("Failed to leave community");
    }
});

export default router;
