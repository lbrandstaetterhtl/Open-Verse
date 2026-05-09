import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../middleware/auth";
import { insertCommunitySchema } from "@shared/schema";
import { notificationService } from "../services/notification-service";
import { activityLogger } from "../services/activity-logger";

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
        // Allow global owners and admins to bypass this
        const isPrivileged = userRole === "admin" || userRole === "owner";
        
        const userId = (req.user as any).id;
        if (!isPrivileged && userKarma < 200) {
            console.log(`[Community] Creation rejected for user ${userId}: Insufficient Karma (${userKarma}/200)`);
            return res.status(403).send("You need at least 200 reputation to create a community.");
        }

        const result = insertCommunitySchema.omit({ 
            creatorId: true, 
            slug: true 
        }).safeParse(req.body);

        if (!result.success) {
            console.error("[Community] Validation failed:", result.error.flatten());
            return res.status(400).json(result.error);
        }

        const slug = result.data.name
            .toLowerCase()
            .replaceAll(/[^a-z0-9]+/g, "-")
            .replaceAll(/(^-|-$)/g, "");

        const existing = await storage.getCommunityBySlug(slug);
        if (existing) {
            return res.status(400).send("A community with this name already exists.");
        }

        const community = await storage.createCommunity({
            ...result.data,
            creatorId: (req.user as any).id,
            slug,
        });

        activityLogger.logFromRequest(req, {
            action: 'community.create',
            category: 'social',
            description: `Neue Community erstellt: ${community.name}`,
            targetType: 'Community',
            targetId: String(community.id),
            targetLabel: community.name,
            severity: 'info',
            newValue: community
        }).catch(err => console.error('[Monitor] community.create failed:', err));

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
                await notificationService.notify({
                    userId: owner.userId,
                    actorId: userId,
                    type: "community_join_request",
                    communityId: communityId,
                    title: community.name,
                    actionUrl: `/mod-panel/${community.id}/requests`
                });
            }
            return res.status(202).json({ message: "Join request submitted" });
        }

        await storage.addCommunityMember(communityId, userId, "member");
        
        activityLogger.logFromRequest(req, {
            action: 'community.join',
            category: 'social',
            description: `Ist der Community beigetreten: ${community.name}`,
            targetType: 'Community',
            targetId: String(community.id),
            targetLabel: community.name,
            severity: 'info'
        }).catch(err => console.error('[Monitor] community.join failed:', err));
        
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
        
        activityLogger.logFromRequest(req, {
            action: 'community.leave',
            category: 'social',
            description: `Hat die Community verlassen (ID: ${communityId})`,
            targetType: 'Community',
            targetId: String(communityId),
            severity: 'info'
        }).catch(err => console.error('[Monitor] community.leave failed:', err));
        
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
        res.status(500).json({ error: "Failed to fetch requests", details: error instanceof Error ? error.message : String(error) });
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
        try {
            await notificationService.notify({
                userId: targetUserId,
                actorId: currentUserId,
                type: "community_join_approved",
                communityId: communityId,
                actionUrl: `/community/${(await storage.getCommunity(communityId))?.slug}`
            });
        } catch (notifErr) {
            console.error("Non-fatal error sending approval notification:", notifErr);
        }

        res.sendStatus(200);
    } catch (error) {
        console.error("Error approving request:", error);
        res.status(500).json({ error: "Failed to approve request", details: error instanceof Error ? error.message : String(error) });
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
        res.status(500).json({ error: "Failed to decline request", details: error instanceof Error ? error.message : String(error) });
    }
});

// Kick a member from the community
router.delete("/:id/members/:userId", isAuthenticated, async (req, res) => {
    try {
        const communityId = parseInt(req.params.id);
        const targetUserId = parseInt(req.params.userId);
        const currentUserId = (req.user as any).id;

        const currentMember = await storage.getCommunityMember(communityId, currentUserId);
        if (!currentMember || (currentMember.role !== "owner" && currentMember.role !== "moderator")) {
            return res.status(403).send("Unauthorized");
        }

        const targetMember = await storage.getCommunityMember(communityId, targetUserId);
        if (!targetMember) {
            return res.status(404).send("Member not found");
        }

        if (targetMember.role === "owner") {
            return res.status(403).send("Cannot kick a community owner");
        }

        // Moderators cannot kick other moderators
        if (currentMember.role === "moderator" && targetMember.role === "moderator") {
            return res.status(403).send("Moderators cannot kick other moderators");
        }

        await storage.removeCommunityMember(communityId, targetUserId);
        
        activityLogger.logFromRequest(req, {
            action: 'community.ban_member',
            category: 'social',
            description: `Mitglied (UserId: ${targetUserId}) aus Community geworfen`,
            targetType: 'Community',
            targetId: String(communityId),
            severity: 'warning',
            metadata: { kickedUserId: targetUserId }
        }).catch(err => console.error('[Monitor] community member kick failed:', err));
        
        res.sendStatus(200);
    } catch (error) {
        console.error("Error kicking member:", error);
        res.status(500).send("Failed to kick member");
    }
});

// Add a moderator
router.post("/:id/moderators", isAuthenticated, async (req, res) => {
    try {
        const communityId = parseInt(req.params.id);
        const targetUserId = parseInt(req.body.userId);
        const currentUserId = (req.user as any).id;

        if (isNaN(targetUserId)) {
            return res.status(400).send("Invalid target User ID");
        }

        const currentMember = await storage.getCommunityMember(communityId, currentUserId);
        const isGlobalAdmin = (req.user as any).role === "admin" || (req.user as any).role === "owner";

        if (!isGlobalAdmin && (!currentMember || currentMember.role !== "owner")) {
            return res.status(403).send("Only owners or global admins can add moderators");
        }

        const targetUser = await storage.getUser(targetUserId);
        if (!targetUser) {
            return res.status(404).send("User not found on the platform");
        }

        const targetMember = await storage.getCommunityMember(communityId, targetUserId);
        if (targetMember) {
            // If they are already a member, promote them
            if (targetMember.role === "owner") {
                return res.status(400).send("User is already an owner");
            }
            await storage.updateCommunityMemberRole(communityId, targetUserId, "moderator");
        } else {
            // Add them as a completely new member with moderator privileges
            await storage.addCommunityMember(communityId, targetUserId, "moderator");
        }

        // Notify user
        const community = await storage.getCommunity(communityId);
        await notificationService.notify({
            userId: targetUserId,
            actorId: currentUserId,
            type: "system_announcement", // Or create a new type. "system_announcement" is fine for now.
            communityId: communityId,
            title: `Moderator in ${community?.name}`,
            actionUrl: `/mod-panel`
        });

        res.sendStatus(200);
    } catch (error) {
        console.error("Error adding moderator:", error);
        res.status(500).send("Failed to add moderator");
    }
});

// Invite a member
router.post("/:id/invite", isAuthenticated, async (req, res) => {
    try {
        const communityId = parseInt(req.params.id);
        const targetUserId = parseInt(req.body.userId);
        const currentUserId = (req.user as any).id;

        if (isNaN(targetUserId)) {
            return res.status(400).send("Invalid target User ID");
        }

        const currentMember = await storage.getCommunityMember(communityId, currentUserId);
        const isGlobalAdmin = (req.user as any).role === "admin" || (req.user as any).role === "owner";

        // Mods and Owners can invite members
        if (!isGlobalAdmin && (!currentMember || (currentMember.role !== "owner" && currentMember.role !== "moderator"))) {
            return res.status(403).send("Only moderators, owners or global admins can invite members");
        }

        const targetUser = await storage.getUser(targetUserId);
        if (!targetUser) {
            return res.status(404).send("User not found on the platform");
        }

        const targetMember = await storage.getCommunityMember(communityId, targetUserId);
        if (targetMember) {
            return res.status(400).send("User is already a member");
        }

        await storage.addCommunityMember(communityId, targetUserId, "member");

        // Notify user
        const community = await storage.getCommunity(communityId);
        await notificationService.notify({
            userId: targetUserId,
            actorId: currentUserId,
            type: "community_join_approved",
            communityId: communityId,
            actionUrl: `/community/${community?.slug}`
        });

        res.sendStatus(200);
    } catch (error) {
        console.error("Error inviting member:", error);
        res.status(500).send("Failed to invite member");
    }
});

router.patch("/:id/members/:userId/role", isAuthenticated, async (req, res) => {
    try {
        const communityId = parseInt(req.params.id);
        const targetUserId = parseInt(req.params.userId);
        const currentUserId = (req.user as any).id;
        const { role } = req.body;

        console.log(`[DEBUG PATCH ROLE] community=${communityId}, target=${targetUserId}, current=${currentUserId}, bodyRole=${role}`);

        if (!["member", "moderator", "owner"].includes(role)) {
            console.log(`[DEBUG PATCH ROLE] Invalid role`);
            return res.status(400).send("Invalid role");
        }

        const currentMember = await storage.getCommunityMember(communityId, currentUserId);
        console.log(`[DEBUG PATCH ROLE] currentMember=`, currentMember);
        
        if (!currentMember || currentMember.role !== "owner") {
            // Global admins bypass this UI check but might have been blocked here. Let's allow global admins:
            const isGlobalAdmin = (req.user as any).role === "admin" || (req.user as any).role === "owner";
            console.log(`[DEBUG PATCH ROLE] isGlobalAdmin=${isGlobalAdmin}`);
            
            if (!isGlobalAdmin) {
                console.log(`[DEBUG PATCH ROLE] Rejected: Not an owner or global admin`);
                return res.status(403).send("Only owners can change member roles");
            }
        }

        const targetMember = await storage.getCommunityMember(communityId, targetUserId);
        console.log(`[DEBUG PATCH ROLE] targetMember=`, targetMember);
        
        if (!targetMember) {
            console.log(`[DEBUG PATCH ROLE] Target not found`);
            return res.status(404).send("Member not found");
        }

        // Safety check: Don't allow demoting the last owner
        if (targetMember.role === "owner" && role !== "owner") {
            const members = await storage.getCommunityMembers(communityId);
            const ownersCount = members.filter(m => m.role === "owner").length;
            if (ownersCount <= 1) {
                console.log(`[DEBUG PATCH ROLE] Cannot demote last owner`);
                return res.status(400).send("A community must have at least one owner");
            }
        }

        console.log(`[DEBUG PATCH ROLE] Proceeding to update role...`);
        await storage.updateCommunityMemberRole(communityId, targetUserId, role);
        console.log(`[DEBUG PATCH ROLE] Role updated successfully!`);
        res.sendStatus(200);
    } catch (error) {
        console.error("Error updating member role:", error);
        res.status(500).send("Failed to update member role");
    }
});

router.get("/:id/members", isAuthenticated, async (req, res) => {
    try {
        const communityId = parseInt(req.params.id);
        const members = await storage.getCommunityMembers(communityId);
        res.json(members);
    } catch (error) {
        console.error("Error fetching community members:", error);
        res.status(500).send("Failed to fetch community members");
    }
});

router.get("/:id/bans", isAuthenticated, async (req, res) => {
    try {
        const communityId = parseInt(req.params.id);
        const userId = (req.user as any).id;

        const member = await storage.getCommunityMember(communityId, userId);
        if (!member || (member.role !== "owner" && member.role !== "moderator")) {
            return res.status(403).send("Unauthorized");
        }

        const bans = await storage.getCommunityBans(communityId);
        res.json(bans);
    } catch (error) {
        console.error("Error fetching community bans:", error);
        res.status(500).send("Failed to fetch community bans");
    }
});

router.get("/:id/reports", isAuthenticated, async (req, res) => {
    try {
        const communityId = parseInt(req.params.id);
        const userId = (req.user as any).id;

        const member = await storage.getCommunityMember(communityId, userId);
        if (!member || (member.role !== "owner" && member.role !== "moderator")) {
            return res.status(403).send("Unauthorized");
        }

        const reports = await storage.getCommunityReports(communityId);
        res.json(reports);
    } catch (error) {
        console.error("Error fetching community reports:", error);
        res.status(500).send("Failed to fetch community reports");
    }
});

router.post("/:id/ban", isAuthenticated, async (req, res) => {
    try {
        const communityId = parseInt(req.params.id);
        const currentUserId = (req.user as any).id;
        const { userId, reason } = req.body;

        const member = await storage.getCommunityMember(communityId, currentUserId);
        if (!member || (member.role !== "owner" && member.role !== "moderator")) {
            return res.status(403).send("Unauthorized");
        }

        const targetMember = await storage.getCommunityMember(communityId, userId);
        if (targetMember && targetMember.role === "owner") {
            return res.status(403).send("Cannot ban a community owner");
        }

        await storage.banUserFromCommunity(communityId, userId, reason);
        
        activityLogger.logFromRequest(req, {
            action: 'community.ban_member',
            category: 'social',
            description: `Mitglied (UserId: ${userId}) dauerhaft aus Community gebannt`,
            targetType: 'Community',
            targetId: String(communityId),
            severity: 'warning',
            metadata: { bannedUserId: userId, reason }
        }).catch(err => console.error('[Monitor] community.ban_member failed:', err));
        
        res.sendStatus(200);
    } catch (error) {
        console.error("Error banning user:", error);
        res.status(500).send("Failed to ban user");
    }
});

router.delete("/:id/ban/:userId", isAuthenticated, async (req, res) => {
    try {
        const communityId = parseInt(req.params.id);
        const targetUserId = parseInt(req.params.userId);
        const currentUserId = (req.user as any).id;

        const member = await storage.getCommunityMember(communityId, currentUserId);
        if (!member || (member.role !== "owner" && member.role !== "moderator")) {
            return res.status(403).send("Unauthorized");
        }

        await storage.unbanUserFromCommunity(communityId, targetUserId);
        
        activityLogger.logFromRequest(req, {
            action: 'community.unban_member',
            category: 'social',
            description: `Mitglied (UserId: ${targetUserId}) entbannt`,
            targetType: 'Community',
            targetId: String(communityId),
            severity: 'info',
            metadata: { unbannedUserId: targetUserId }
        }).catch(err => console.error('[Monitor] community.unban_member failed:', err));
        
        res.sendStatus(200);
    } catch (error) {
        console.error("Error unbanning user:", error);
        res.status(500).send("Failed to unban user");
    }
});

export default router;
