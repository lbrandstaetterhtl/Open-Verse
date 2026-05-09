
import { Router } from "express";
import { storage } from "../storage";
import { isAdmin } from "../middleware/auth";
import { insertAdminGroupSchema } from "@shared/schema";
import { activityLogger } from "../services/activity-logger";

const router = Router();

// Get all admin groups
router.get("/", isAdmin, async (req, res) => {
    try {
        const groups = await storage.getAdminGroups();
        res.json(groups);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch admin groups" });
    }
});

// Create a new admin group
router.post("/", isAdmin, async (req, res) => {
    try {
        const result = insertAdminGroupSchema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json(result.error);
        }

        const group = await storage.createAdminGroup(result.data);
        
        activityLogger.logFromRequest(req, {
            action: 'admin.group_create',
            category: 'admin',
            description: `Admin-Gruppe '${group.name}' erstellt`,
            targetType: 'AdminGroup',
            targetId: String(group.id),
            severity: 'info'
        }).catch(err => console.error('[Monitor] group_create log failed:', err));

        res.status(201).json(group);
    } catch (error) {
        res.status(500).json({ message: "Failed to create admin group" });
    }
});

// Update an admin group
router.patch("/:id", isAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const group = await storage.updateAdminGroup(id, req.body);
        
        activityLogger.logFromRequest(req, {
            action: 'admin.group_update',
            category: 'admin',
            description: `Admin-Gruppe '${group.name}' aktualisiert`,
            targetType: 'AdminGroup',
            targetId: String(id),
            severity: 'info'
        }).catch(err => console.error('[Monitor] group_update log failed:', err));

        res.json(group);
    } catch (error) {
        res.status(500).json({ message: "Failed to update admin group" });
    }
});

// Delete an admin group
router.delete("/:id", isAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await storage.deleteAdminGroup(id);
        
        activityLogger.logFromRequest(req, {
            action: 'admin.group_delete',
            category: 'admin',
            description: `Admin-Gruppe ID ${id} gelöscht`,
            targetType: 'AdminGroup',
            targetId: String(id),
            severity: 'warning'
        }).catch(err => console.error('[Monitor] group_delete log failed:', err));

        res.sendStatus(204);
    } catch (error) {
        res.status(500).json({ message: "Failed to delete admin group" });
    }
});

// Assign a user to an admin group
router.post("/assign", isAdmin, async (req, res) => {
    try {
        const { userId, groupId } = req.body;
        if (!userId) return res.status(400).json({ message: "User ID required" });

        const user = await storage.updateUserProfile(userId, { adminGroupId: groupId });
        
        activityLogger.logFromRequest(req, {
            action: 'admin.user_group_assign',
            category: 'admin',
            description: `User '${user.username}' wurde Gruppe ID ${groupId} zugewiesen`,
            targetType: 'User',
            targetId: String(userId),
            severity: 'info'
        }).catch(err => console.error('[Monitor] user_group_assign log failed:', err));

        res.json(user);
    } catch (error) {
        res.status(500).json({ message: "Failed to assign group" });
    }
});

export default router;
