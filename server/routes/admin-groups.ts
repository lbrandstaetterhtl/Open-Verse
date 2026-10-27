import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { storage, sanitizeUser } from "../storage";
import { db } from "../db";
import { users } from "@shared/schema";
import { hasPermission } from "../middleware/auth";
import { insertAdminGroupSchema } from "@shared/schema";
import { activityLogger } from "../services/activity-logger";
import { isKnownPermission, parsePermissionList, holdsAll } from "../utils/permissions";
import { validateIdParams } from "../utils/params";
import { dbId, isPlainBody } from "../utils/admin-input";
import { sendValidationError, sendInternalError } from "../utils/http-errors";

const router = Router();

// Group management is its own permission (owners hold every permission). Besides that, nobody can hand
// out more than they hold: a non-owner may only create, edit, delete or assign groups whose permissions
// are a subset of their own, and never change their own group or an owner's.
router.use(hasPermission("groups"));
validateIdParams(router, ["id"]);

const forbidden = (res: any, error: string, code: string) => res.status(403).json({ error, code });
const groupNotFound = (res: any) => res.status(404).json({ error: "Group not found", code: "GROUP_NOT_FOUND" });

/** Normalises the permission list (JSON text or array) to a JSON array of known names; null when invalid. */
function normalisePermissions(raw: string | string[]): string | null {
  let list: unknown = raw;
  if (typeof raw === "string") {
    try { list = JSON.parse(raw); } catch { return null; }
  }
  if (!Array.isArray(list) || !list.every(isKnownPermission)) return null;
  return JSON.stringify(Array.from(new Set(list)));
}

const invalidPermissions = (res: any) =>
  res.status(400).json({ error: "Unknown permission in the list", code: "INVALID_PERMISSIONS" });

async function nameTaken(name: string, exceptId?: number) {
  const groups = await storage.getAdminGroups();
  return groups.some((g) => g.id !== exceptId && g.name.trim().toLowerCase() === name.toLowerCase());
}
const nameTakenError = (res: any) =>
  res.status(409).json({ error: "A group with this name already exists", code: "GROUP_NAME_TAKEN" });
const isUniqueViolation = (e: any) => e?.code === "23505" || e?.cause?.code === "23505";

// Get all admin groups
router.get("/", async (req, res) => {
  try {
    const groups = await storage.getAdminGroups();
    res.json(groups);
  } catch (error) {
    sendInternalError(res, error, "admin groups list failed");
  }
});

// Create a new admin group
router.post("/", async (req, res) => {
  try {
    const result = insertAdminGroupSchema.safeParse(req.body);
    if (!result.success) return sendValidationError(res, result.error);

    const permissions = normalisePermissions(result.data.permissions);
    if (permissions === null) return invalidPermissions(res);
    if (!(await holdsAll(req.user, JSON.parse(permissions)))) {
      return forbidden(res, "You cannot grant permissions you do not have", "PERMISSION_ESCALATION");
    }
    if (await nameTaken(result.data.name)) return nameTakenError(res);

    const group = await storage.createAdminGroup({ ...result.data, permissions });

    activityLogger.logFromRequest(req, {
      action: 'admin.group_create',
      category: 'admin',
      description: `Admin-Gruppe '${group.name}' erstellt`,
      targetType: 'AdminGroup',
      targetId: String(group.id),
      targetLabel: group.name,
      newValue: { name: group.name, permissions: group.permissions },
      severity: 'info'
    }).catch(err => console.error('[Monitor] group_create log failed:', err));

    res.status(201).json(group);
  } catch (error) {
    if (isUniqueViolation(error)) return nameTakenError(res);
    sendInternalError(res, error, "admin group create failed");
  }
});

// Update an admin group
router.patch("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!isPlainBody(req.body)) return res.status(400).json({ error: "Invalid input", code: "VALIDATION_ERROR" });
    const result = insertAdminGroupSchema.partial().safeParse(req.body);
    if (!result.success) return sendValidationError(res, result.error);

    const existing = await storage.getAdminGroup(id);
    if (!existing) return groupNotFound(res);

    const update: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(result.data)) if (v !== undefined) update[k] = v;
    if (Object.keys(update).length === 0) return res.status(400).json({ error: "No valid fields provided for update" });

    if (result.data.permissions !== undefined) {
      const permissions = normalisePermissions(result.data.permissions);
      if (permissions === null) return invalidPermissions(res);
      update.permissions = permissions;
    }
    // Editing a group needs every permission it has now and every permission it would get.
    const wanted = [...parsePermissionList(existing.permissions), ...(update.permissions ? JSON.parse(update.permissions as string) : [])];
    if (!(await holdsAll(req.user, wanted))) {
      return forbidden(res, "You cannot grant permissions you do not have", "PERMISSION_ESCALATION");
    }
    if (typeof update.name === "string" && await nameTaken(update.name, id)) return nameTakenError(res);

    const group = await storage.updateAdminGroup(id, update as any);
    if (!group) return groupNotFound(res);

    activityLogger.logFromRequest(req, {
      action: 'admin.group_update',
      category: 'admin',
      description: `Admin-Gruppe '${group.name}' aktualisiert`,
      targetType: 'AdminGroup',
      targetId: String(id),
      targetLabel: group.name,
      oldValue: { name: existing.name, permissions: existing.permissions },
      newValue: update,
      severity: 'info'
    }).catch(err => console.error('[Monitor] group_update log failed:', err));

    res.json(group);
  } catch (error) {
    if (isUniqueViolation(error)) return nameTakenError(res);
    sendInternalError(res, error, "admin group update failed");
  }
});

// Delete an admin group
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await storage.getAdminGroup(id);
    if (!existing) return groupNotFound(res);
    if (!(await holdsAll(req.user, parsePermissionList(existing.permissions)))) {
      return forbidden(res, "You cannot grant permissions you do not have", "PERMISSION_ESCALATION");
    }

    await storage.deleteAdminGroup(id);
    // Members lose the group (and its permissions) right away; a later group with a reused id must not inherit them.
    await db.update(users).set({ adminGroupId: null }).where(eq(users.adminGroupId, id));

    activityLogger.logFromRequest(req, {
      action: 'admin.group_delete',
      category: 'admin',
      description: `Admin-Gruppe ID ${id} gelöscht`,
      targetType: 'AdminGroup',
      targetId: String(id),
      targetLabel: existing.name,
      oldValue: { name: existing.name, permissions: existing.permissions },
      severity: 'warning'
    }).catch(err => console.error('[Monitor] group_delete log failed:', err));

    res.sendStatus(204);
  } catch (error) {
    sendInternalError(res, error, "admin group delete failed");
  }
});

const assignSchema = z.object({ userId: dbId, groupId: z.union([dbId, z.null()]) });

/**
 * Shared rule for changing a user's admin group (also used by PATCH /api/admin/users/:id).
 * Returns an error response tuple or null when the change is allowed.
 */
export async function checkGroupAssignment(
  caller: any,
  target: { id: number; role: string; adminGroupId: number | null },
  groupId: number | null,
): Promise<{ status: number; body: { error: string; code: string } } | null> {
  if (caller.role === "owner") {
    if (groupId !== null && !(await storage.getAdminGroup(groupId))) return { status: 404, body: { error: "Group not found", code: "GROUP_NOT_FOUND" } };
    return null;
  }
  if (target.id === caller.id) return { status: 403, body: { error: "You cannot change your own admin group", code: "SELF_GROUP_CHANGE" } };
  if (target.role === "owner") return { status: 403, body: { error: "Only owners can change owner accounts", code: "OWNER_PROTECTED" } };
  const newGroup = groupId === null ? null : await storage.getAdminGroup(groupId);
  if (groupId !== null && !newGroup) return { status: 404, body: { error: "Group not found", code: "GROUP_NOT_FOUND" } };
  const oldGroup = target.adminGroupId ? await storage.getAdminGroup(target.adminGroupId) : null;
  const wanted = [...parsePermissionList(newGroup?.permissions), ...parsePermissionList(oldGroup?.permissions)];
  if (!(await holdsAll(caller, wanted))) {
    return { status: 403, body: { error: "You cannot grant permissions you do not have", code: "PERMISSION_ESCALATION" } };
  }
  return null;
}

// Assign a user to an admin group
router.post("/assign", async (req, res) => {
  try {
    const result = assignSchema.safeParse(req.body);
    if (!result.success) return sendValidationError(res, result.error);
    const { userId, groupId } = result.data;

    const target = await storage.getUser(userId);
    if (!target) return res.status(404).json({ error: "User not found" });

    const denied = await checkGroupAssignment(req.user, target as any, groupId);
    if (denied) return res.status(denied.status).json(denied.body);

    const [user] = await db.update(users).set({ adminGroupId: groupId }).where(eq(users.id, userId)).returning();
    if (!user) return res.status(404).json({ error: "User not found" });

    activityLogger.logFromRequest(req, {
      action: 'admin.user_group_assign',
      category: 'admin',
      description: `User '${user.username}' wurde Gruppe ID ${groupId} zugewiesen`,
      targetType: 'User',
      targetId: String(userId),
      targetLabel: user.username,
      oldValue: { adminGroupId: (target as any).adminGroupId ?? null },
      newValue: { adminGroupId: groupId },
      severity: 'info'
    }).catch(err => console.error('[Monitor] user_group_assign log failed:', err));

    res.json(sanitizeUser(user));
  } catch (error) {
    sendInternalError(res, error, "admin group assign failed");
  }
});

export default router;
