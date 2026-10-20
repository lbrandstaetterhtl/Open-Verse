import { Router, type Response } from "express";
import { randomBytes } from "node:crypto";
import { storage } from "../storage";
import { isAuthenticated } from "../middleware/auth";
import { insertCommunitySchema } from "@shared/schema";
import { notificationService } from "../services/notification-service";
import { activityLogger } from "../services/activity-logger";
import { validateIdParams, parseId } from "../utils/params";
import { canViewCommunity } from "../utils/community-access";

import { sendValidationError } from "../utils/http-errors";
const router = Router();

// Malformed ids in the path answer 404 before any handler runs (no NaN / int4 overflow in queries).
validateIdParams(router, ["id", "userId", "reportId"]);
router.param("slug", (_req, res, next, value: string) => {
    if (typeof value !== "string" || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)) {
        return res.status(404).json({ error: "Community not found", code: "NOT_FOUND" });
    }
    next();
});

/** Plain JSON error answer (never text/html, never database details). */
const fail = (res: Response, status: number, error: string, code?: string) =>
    res.status(status).json(code ? { error, code } : { error });

const isGlobalStaff = (user: any) => user?.role === "admin" || user?.role === "owner";

router.get("/", async (req, res) => {
    try {
        const communities = await storage.getCommunities();
        res.json(communities);
    } catch (error) {
        console.error("Error fetching communities:", error);
        fail(res, 500, "Failed to fetch communities");
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
            return fail(res, 403, "You need at least 200 reputation to create a community.");
        }

        const result = insertCommunitySchema.omit({ 
            creatorId: true, 
            slug: true 
        }).safeParse(req.body);

        if (!result.success) {
            console.error("[Community] Validation failed:", result.error.flatten());
            return sendValidationError(res, result.error);
        }

        // Slug from ASCII letters/digits; names without any (e.g. only Greek or Cyrillic letters) get a random slug.
        const slug = result.data.name
            .toLowerCase()
            .replaceAll(/[^a-z0-9]+/g, "-")
            .replaceAll(/(^-|-$)/g, "")
            .slice(0, 100) || `c-${randomBytes(5).toString("hex")}`;

        const existing = await storage.getCommunityBySlug(slug);
        if (existing) {
            return fail(res, 400, "A community with this name already exists.");
        }

        const { name, description, imageUrl, allowedCategories, isPrivate } = result.data;
        const community = await storage.createCommunity({
            name,
            description: description || null,
            imageUrl: imageUrl || null,
            ...(allowedCategories ? { allowedCategories } : {}),
            isPrivate: isPrivate ? 1 : 0,
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
    } catch (error: any) {
        // Two requests with the same name at once: the unique slug constraint decides
        if ((error?.code ?? error?.cause?.code) === "23505") return fail(res, 400, "A community with this name already exists.");
        console.error("Error creating community:", error);
        fail(res, 500, "Failed to create community");
    }
});

router.get("/:slug", async (req, res) => {
    try {
        const community = await storage.getCommunityBySlug(req.params.slug);
        if (!community) return fail(res, 404, "Community not found");

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
        fail(res, 500, "Failed to fetch community");
    }
});

router.post("/:id/join", isAuthenticated, async (req, res) => {
    try {
        const communityId = Number(req.params.id);
        const userId = (req.user as any).id;

        const community = await storage.getCommunity(communityId);
        if (!community) return fail(res, 404, "Community not found");

        const isBanned = await storage.isUserBannedFromCommunity(communityId, userId);
        if (isBanned) return fail(res, 403, "You are banned from this community.");

        const existingMember = await storage.getCommunityMember(communityId, userId);
        if (existingMember) return fail(res, 400, "Already a member");

        if (community.isPrivate) {
            const existingRequest = await storage.getJoinRequest(communityId, userId);
            if (existingRequest) {
                if (existingRequest.status === "pending") {
                    return fail(res, 400, "Request already pending");
                }
                if (existingRequest.status === "declined") {
                    const oneWeekAgo = new Date();
                    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
                    if (existingRequest.createdAt > oneWeekAgo) {
                        return fail(res, 403, "Join request was recently declined. Please wait a week before requesting again.");
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
        fail(res, 500, "Failed to join community");
    }
});

router.post("/:id/leave", isAuthenticated, async (req, res) => {
    try {
        const communityId = Number(req.params.id);
        const userId = (req.user as any).id;

        const member = await storage.getCommunityMember(communityId, userId);
        if (!member) return fail(res, 400, "Not a member");

        if (member.role === "owner") {
            return fail(res, 400, "Owner cannot leave the community. Transfer ownership first.");
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
        fail(res, 500, "Failed to leave community");
    }
});

router.get("/:id/requests", isAuthenticated, async (req, res) => {
    try {
        const communityId = Number(req.params.id);
        const userId = (req.user as any).id;

        const member = await storage.getCommunityMember(communityId, userId);
        if (!member || (member.role !== "owner" && member.role !== "moderator")) {
            return fail(res, 403, "Unauthorized");
        }

        const requests = await storage.getCommunityJoinRequests(communityId);
        res.json(requests);
    } catch (error) {
        console.error("Error fetching requests:", error);
        fail(res, 500, "Failed to fetch requests");
    }
});

router.post("/:id/requests/:userId/approve", isAuthenticated, async (req, res) => {
    try {
        const communityId = Number(req.params.id);
        const targetUserId = Number(req.params.userId);
        const currentUserId = (req.user as any).id;


        const member = await storage.getCommunityMember(communityId, currentUserId);
        if (!member || (member.role !== "owner" && member.role !== "moderator")) {
            return fail(res, 403, "Unauthorized");
        }

        // Only a pending request can be approved, and never for a banned user (unban first).
        if (await storage.isUserBannedFromCommunity(communityId, targetUserId)) {
            return fail(res, 409, "This user is banned from this community", "USER_BANNED_FROM_COMMUNITY");
        }
        if (!(await storage.updateJoinRequestStatus(communityId, targetUserId, "approved"))) {
            return fail(res, 404, "No pending join request for this user", "NO_PENDING_REQUEST");
        }
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
        fail(res, 500, "Failed to approve request");
    }
});

router.post("/:id/requests/:userId/decline", isAuthenticated, async (req, res) => {
    try {
        const communityId = Number(req.params.id);
        const targetUserId = Number(req.params.userId);
        const currentUserId = (req.user as any).id;


        const member = await storage.getCommunityMember(communityId, currentUserId);
        if (!member || (member.role !== "owner" && member.role !== "moderator")) {
            return fail(res, 403, "Unauthorized");
        }

        if (!(await storage.updateJoinRequestStatus(communityId, targetUserId, "declined"))) {
            return fail(res, 404, "No pending join request for this user", "NO_PENDING_REQUEST");
        }
        res.sendStatus(200);
    } catch (error) {
        console.error("Error declining request:", error);
        fail(res, 500, "Failed to decline request");
    }
});

// Kick a member from the community
router.delete("/:id/members/:userId", isAuthenticated, async (req, res) => {
    try {
        const communityId = Number(req.params.id);
        const targetUserId = Number(req.params.userId);
        const currentUserId = (req.user as any).id;

        const currentMember = await storage.getCommunityMember(communityId, currentUserId);
        if (!currentMember || (currentMember.role !== "owner" && currentMember.role !== "moderator")) {
            return fail(res, 403, "Unauthorized");
        }

        const targetMember = await storage.getCommunityMember(communityId, targetUserId);
        if (!targetMember) {
            return fail(res, 404, "Member not found");
        }

        if (targetMember.role === "owner") {
            return fail(res, 403, "Cannot kick a community owner");
        }

        // Moderators cannot kick other moderators
        if (currentMember.role === "moderator" && targetMember.role === "moderator") {
            return fail(res, 403, "Moderators cannot kick other moderators");
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
        fail(res, 500, "Failed to kick member");
    }
});

// Add a moderator
router.post("/:id/moderators", isAuthenticated, async (req, res) => {
    try {
        const communityId = Number(req.params.id);
        const targetUserId = parseId(req.body?.userId);
        const currentUserId = (req.user as any).id;

        if (targetUserId === null) {
            return fail(res, 400, "Invalid target User ID");
        }

        const currentMember = await storage.getCommunityMember(communityId, currentUserId);
        const isGlobalAdmin = isGlobalStaff(req.user);

        if (!isGlobalAdmin && (!currentMember || currentMember.role !== "owner")) {
            return fail(res, 403, "Only owners or global admins can add moderators");
        }
        if (!(await storage.getCommunity(communityId))) {
            return fail(res, 404, "Community not found");
        }

        const targetUser = await storage.getUser(targetUserId);
        if (!targetUser) {
            return fail(res, 404, "User not found on the platform");
        }
        if (await storage.isUserBannedFromCommunity(communityId, targetUserId)) {
            return fail(res, 409, "This user is banned from this community", "USER_BANNED_FROM_COMMUNITY");
        }

        const targetMember = await storage.getCommunityMember(communityId, targetUserId);
        if (targetMember) {
            // If they are already a member, promote them
            if (targetMember.role === "owner") {
                return fail(res, 400, "User is already an owner");
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
        fail(res, 500, "Failed to add moderator");
    }
});

// Invite a member
router.post("/:id/invite", isAuthenticated, async (req, res) => {
    try {
        const communityId = Number(req.params.id);
        const targetUserId = parseId(req.body?.userId);
        const currentUserId = (req.user as any).id;

        if (targetUserId === null) {
            return fail(res, 400, "Invalid target User ID");
        }

        const currentMember = await storage.getCommunityMember(communityId, currentUserId);
        const isGlobalAdmin = isGlobalStaff(req.user);

        // Mods and Owners can invite members
        if (!isGlobalAdmin && (!currentMember || (currentMember.role !== "owner" && currentMember.role !== "moderator"))) {
            return fail(res, 403, "Only moderators, owners or global admins can invite members");
        }
        if (!(await storage.getCommunity(communityId))) {
            return fail(res, 404, "Community not found");
        }

        const targetUser = await storage.getUser(targetUserId);
        if (!targetUser) {
            return fail(res, 404, "User not found on the platform");
        }
        if (await storage.isUserBannedFromCommunity(communityId, targetUserId)) {
            return fail(res, 409, "This user is banned from this community", "USER_BANNED_FROM_COMMUNITY");
        }

        const targetMember = await storage.getCommunityMember(communityId, targetUserId);
        if (targetMember) {
            return fail(res, 400, "User is already a member");
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
        fail(res, 500, "Failed to invite member");
    }
});

router.patch("/:id/members/:userId/role", isAuthenticated, async (req, res) => {
    try {
        const communityId = Number(req.params.id);
        const targetUserId = Number(req.params.userId);
        const currentUserId = (req.user as any).id;
        const role = req.body?.role;

        if (typeof role !== "string" || !["member", "moderator", "owner"].includes(role)) {
            return fail(res, 400, "Invalid role");
        }

        const currentMember = await storage.getCommunityMember(communityId, currentUserId);

        // Community owners and global admins may change roles
        if ((!currentMember || currentMember.role !== "owner") && !isGlobalStaff(req.user)) {
            return fail(res, 403, "Only owners can change member roles");
        }

        const targetMember = await storage.getCommunityMember(communityId, targetUserId);
        if (!targetMember) {
            return fail(res, 404, "Member not found");
        }

        // Safety check: Don't allow demoting the last owner
        if (targetMember.role === "owner" && role !== "owner") {
            const members = await storage.getCommunityMembers(communityId);
            const ownersCount = members.filter(m => m.role === "owner").length;
            if (ownersCount <= 1) {
                return fail(res, 400, "A community must have at least one owner");
            }
        }

        await storage.updateCommunityMemberRole(communityId, targetUserId, role);
        res.sendStatus(200);
    } catch (error) {
        console.error("Error updating member role:", error);
        fail(res, 500, "Failed to update member role");
    }
});

router.get("/:id/members", isAuthenticated, async (req, res) => {
    try {
        const communityId = Number(req.params.id);
        const community = await storage.getCommunity(communityId);
        if (!community) return fail(res, 404, "Community not found");
        // Members of a private community are only listed to its members and site staff.
        if (!(await canViewCommunity(req.user, communityId))) {
            return fail(res, 403, "Forbidden", "PRIVATE_COMMUNITY");
        }
        const members = await storage.getCommunityMembers(communityId);
        res.json(members);
    } catch (error) {
        console.error("Error fetching community members:", error);
        fail(res, 500, "Failed to fetch community members");
    }
});

router.get("/:id/bans", isAuthenticated, async (req, res) => {
    try {
        const communityId = Number(req.params.id);
        const userId = (req.user as any).id;

        const member = await storage.getCommunityMember(communityId, userId);
        if (!member || (member.role !== "owner" && member.role !== "moderator")) {
            return fail(res, 403, "Unauthorized");
        }

        const bans = await storage.getCommunityBans(communityId);
        res.json(bans);
    } catch (error) {
        console.error("Error fetching community bans:", error);
        fail(res, 500, "Failed to fetch community bans");
    }
});

router.get("/:id/reports", isAuthenticated, async (req, res) => {
    try {
        const communityId = Number(req.params.id);
        const userId = (req.user as any).id;

        const member = await storage.getCommunityMember(communityId, userId);
        if (!member || (member.role !== "owner" && member.role !== "moderator")) {
            return fail(res, 403, "Unauthorized");
        }

        const reports = await storage.getCommunityReports(communityId);
        // Community moderators are regular users: they never get the reporter's IP address or identity.
        res.json(isGlobalStaff(req.user)
            ? reports
            : reports.map(({ ipAddress: _ip, reporterId: _reporter, ...r }) => r));
    } catch (error) {
        console.error("Error fetching community reports:", error);
        fail(res, 500, "Failed to fetch community reports");
    }
});

router.patch("/:id/reports/:reportId", isAuthenticated, async (req, res) => {
    try {
        const communityId = Number(req.params.id);
        const reportId = Number(req.params.reportId);
        const userId = (req.user as any).id;
        const status = req.body?.status;

        if (typeof status !== "string" || !["pending", "resolved", "rejected"].includes(status)) {
            return fail(res, 400, "Invalid status");
        }

        const member = await storage.getCommunityMember(communityId, userId);
        if (!member || (member.role !== "owner" && member.role !== "moderator")) {
            return fail(res, 403, "Unauthorized");
        }

        const communityReports = await storage.getCommunityReports(communityId);
        if (!communityReports.some(r => r.id === reportId)) {
            return fail(res, 404, "Report not found in this community");
        }

        const updated = await storage.updateReportStatus(reportId, status, userId);
        res.json(updated);
    } catch (error) {
        console.error("Error updating community report:", error);
        fail(res, 500, "Failed to update community report");
    }
});

router.post("/:id/ban", isAuthenticated, async (req, res) => {
    try {
        const communityId = Number(req.params.id);
        const currentUserId = (req.user as any).id;
        const userId = parseId(req.body?.userId) ?? 0;
        // Control characters (NUL is rejected by Postgres) are dropped from the free-text reason.
        const reason = typeof req.body?.reason === "string"
            ? req.body.reason.replaceAll(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, 500)
            : undefined;

        if (!userId) {
            return fail(res, 400, "Invalid user ID");
        }
        if (userId === currentUserId) {
            return fail(res, 400, "You cannot ban yourself");
        }

        const member = await storage.getCommunityMember(communityId, currentUserId);
        if (!member || (member.role !== "owner" && member.role !== "moderator")) {
            return fail(res, 403, "Unauthorized");
        }

        const targetMember = await storage.getCommunityMember(communityId, userId);
        if (targetMember && targetMember.role === "owner") {
            return fail(res, 403, "Cannot ban a community owner");
        }
        // Same rule as for kicking: moderators cannot remove other moderators
        if (targetMember && targetMember.role === "moderator" && member.role === "moderator") {
            return fail(res, 403, "Moderators cannot ban other moderators");
        }
        if (!(await storage.getUser(userId))) {
            return fail(res, 404, "User not found");
        }
        if (await storage.isUserBannedFromCommunity(communityId, userId)) {
            return fail(res, 409, "User is already banned");
        }

        await storage.banUserFromCommunity(communityId, userId, reason || undefined);
        
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
        fail(res, 500, "Failed to ban user");
    }
});

router.delete("/:id/ban/:userId", isAuthenticated, async (req, res) => {
    try {
        const communityId = Number(req.params.id);
        const targetUserId = Number(req.params.userId);
        const currentUserId = (req.user as any).id;

        const member = await storage.getCommunityMember(communityId, currentUserId);
        if (!member || (member.role !== "owner" && member.role !== "moderator")) {
            return fail(res, 403, "Unauthorized");
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
        fail(res, 500, "Failed to unban user");
    }
});

export default router;
