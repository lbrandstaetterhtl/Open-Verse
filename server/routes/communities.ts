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

        // SECURITY FIX [VULN-003]: Re-enable karma requirement for community creation
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
        let requestStatus = null;
        if (req.isAuthenticated()) {
            const userId = (req.user as any).id;
            const member = await storage.getCommunityMember(community.id, userId);
            if (member) {
                memberInfo = { role: member.role, joinedAt: member.joinedAt };
            } else if (community.isPrivate) {
                const request = await storage.getJoinRequest(community.id, userId);
                if (request) {
                    requestStatus = request.status;
                }
            }
        }

        res.json({ ...community, memberInfo, requestStatus });
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

        if (community.isPrivate) {
            const existingRequest = await storage.getJoinRequest(communityId, userId);
            if (existingRequest) {
                if (existingRequest.status === "pending") {
                    return res.status(400).send("Request already pending");
                }
                if (existingRequest.status === "declined") {
                    const oneWeekAgo = new Date();
                    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
                    if (existingRequest.createdAt > oneWeekAgo) {
                        return res.status(403).send("Join request was recently declined. Please wait a week before requesting again.");
                    }
                }
            }
            await storage.addJoinRequest(communityId, userId);
            
            // Notify owners
            const members = await storage.getCommunityMembers(communityId);
            const owners = members.filter(m => m.role === "owner" || m.role === "moderator");
            for (const owner of owners) {
                await storage.createNotification({
                    userId: owner.userId,
                    type: "action",
                    fromUserId: userId,
                    read: false,
                    createdAt: new Date()
                });
            }
            return res.status(202).json({ message: "Join request submitted" });
        }

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

router.get("/:id/requests", isAuthenticated, async (req, res) => {
    try {
        const communityId = parseInt(req.params.id);
        const userId = (req.user as any).id;

        const member = await storage.getCommunityMember(communityId, userId);
        if (!member || (member.role !== "owner" && member.role !== "moderator")) {
            return res.status(403).send("Unauthorized");
        }

        const requests = await storage.getCommunityJoinRequests(communityId);
        res.json(requests);
    } catch (error) {
        console.error("Error fetching requests:", error);
        res.status(500).send("Failed to fetch requests");
    }
});

router.post("/:id/requests/:userId/approve", isAuthenticated, async (req, res) => {
    try {
        const communityId = parseInt(req.params.id);
        const targetUserId = parseInt(req.params.userId);
        const currentUserId = (req.user as any).id;

        const member = await storage.getCommunityMember(communityId, currentUserId);
        if (!member || (member.role !== "owner" && member.role !== "moderator")) {
            return res.status(403).send("Unauthorized");
        }

        await storage.updateJoinRequestStatus(communityId, targetUserId, "approved");
        await storage.addCommunityMember(communityId, targetUserId, "member");
        
        // Notify user
        await storage.createNotification({
            userId: targetUserId,
            type: "welcome",
            fromUserId: currentUserId,
            read: false,
            createdAt: new Date()
        });

        res.sendStatus(200);
    } catch (error) {
        console.error("Error approving request:", error);
        res.status(500).send("Failed to approve request");
    }
});

router.post("/:id/requests/:userId/decline", isAuthenticated, async (req, res) => {
    try {
        const communityId = parseInt(req.params.id);
        const targetUserId = parseInt(req.params.userId);
        const currentUserId = (req.user as any).id;

        const member = await storage.getCommunityMember(communityId, currentUserId);
        if (!member || (member.role !== "owner" && member.role !== "moderator")) {
            return res.status(403).send("Unauthorized");
        }

        await storage.updateJoinRequestStatus(communityId, targetUserId, "declined");
        res.sendStatus(200);
    } catch (error) {
        console.error("Error declining request:", error);
        res.status(500).send("Failed to decline request");
    }
});

router.patch("/:id/members/:userId/role", isAuthenticated, async (req, res) => {
    try {
        const communityId = parseInt(req.params.id);
        const targetUserId = parseInt(req.params.userId);
        const currentUserId = (req.user as any).id;
        const { role } = req.body;

        if (!["member", "moderator", "owner"].includes(role)) {
            return res.status(400).send("Invalid role");
        }

        const currentMember = await storage.getCommunityMember(communityId, currentUserId);
        if (!currentMember || currentMember.role !== "owner") {
            return res.status(403).send("Only owners can change member roles");
        }

        const targetMember = await storage.getCommunityMember(communityId, targetUserId);
        if (!targetMember) {
            return res.status(404).send("Member not found");
        }

        // Safety check: Don't allow demoting the last owner
        if (targetMember.role === "owner" && role !== "owner") {
            const members = await storage.getCommunityMembers(communityId);
            const ownersCount = members.filter(m => m.role === "owner").length;
            if (ownersCount <= 1) {
                return res.status(400).send("A community must have at least one owner");
            }
        }

        await storage.updateCommunityMemberRole(communityId, targetUserId, role);
        res.sendStatus(200);
    } catch (error) {
        console.error("Error updating member role:", error);
        res.status(500).send("Failed to update member role");
    }
});

export default router;
