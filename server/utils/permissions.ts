import { storage } from "../storage";

/**
 * Determines if a user has permission to delete content (post/comment).
 * @param requestingUser The user attempting the deletion
 * @param authorId The ID of the content's author
 * @param targetUserRole The role of the content's author
 */
export const canDeleteContent = (requestingUser: any, authorId: number, targetUserRole: string): boolean => {
    if (requestingUser.role === 'owner') return true; // Owner can delete anything
    if (requestingUser.role === 'admin' && targetUserRole !== 'owner') return true; // Admin can delete non-owner content
    if (authorId === requestingUser.id) return true; // Users can delete their own content
    return false;
};

/**
 * Admin group permissions. Must match the ids offered by the admin UI
 * (client/src/components/admin/GroupsManagement.tsx AVAILABLE_PERMISSIONS) and the `permission` of the
 * sidebar entries (client/src/components/layout/AppSidebar.tsx).
 */
export const ADMIN_PERMISSIONS = [
    "dashboard",
    "users",
    "reports",
    "groups",
    "security",
    "auto_punishment",
    "logs",
    "analytics",
    "performance",
    "tickets",
    "stress_test",
    "settings",
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export const isKnownPermission = (p: unknown): p is AdminPermission =>
    typeof p === "string" && (ADMIN_PERMISSIONS as readonly string[]).includes(p);

/** Parses a group's stored permission list (JSON text or array); unknown entries are dropped. */
export function parsePermissionList(raw: unknown): AdminPermission[] {
    let list: unknown = raw;
    if (typeof raw === "string") {
        try { list = JSON.parse(raw); } catch { return []; }
    }
    return Array.isArray(list) ? Array.from(new Set(list.filter(isKnownPermission))) : [];
}

/**
 * The group permissions a user currently holds: owners hold all of them, admins those of their group,
 * everybody else none. Reads the group fresh from the database so changes apply immediately.
 */
export async function permissionsOf(user: any): Promise<Set<AdminPermission>> {
    if (!user) return new Set();
    if (user.role === "owner") return new Set(ADMIN_PERMISSIONS);
    if (user.role !== "admin" || !user.adminGroupId) return new Set();
    const group = await storage.getAdminGroup(user.adminGroupId);
    return new Set(group ? parsePermissionList(group.permissions) : []);
}

/** Same rule as the hasPermission middleware, for checks inside handlers and services. */
export async function userHasPermission(user: any, permission: AdminPermission): Promise<boolean> {
    if (!user) return false;
    if (user.role === "owner") return true;
    return (await permissionsOf(user)).has(permission);
}

/** true when every permission in `wanted` is also held by the caller (nobody may hand out more than they have). */
export async function holdsAll(user: any, wanted: Iterable<string>): Promise<boolean> {
    if (user?.role === "owner") return true;
    const mine = await permissionsOf(user);
    return Array.from(wanted).every((p) => mine.has(p as AdminPermission));
}
