import type { Request, Response, NextFunction } from "express";
import { logSecurityEvent } from "../utils/logger";
import { storage } from "../storage";

// Standard Express Request with User type is handled by global declaration in auth.ts or similar
// assuming req.user is populated by passport

/** Site staff: role admin or owner. */
export const isStaffUser = (user: any): boolean => !!user && (user.role === "admin" || user.role === "owner");

/**
 * The answer for an API path that does not exist. Staff-only routes give exactly this answer to anonymous
 * visitors and to users who are not staff, so nobody outside the staff can tell which staff routes exist.
 */
export const sendApiNotFound = (res: Response) => res.status(404).json({ error: "Not found" });

const callerIsStaff = (req: Request) => !!req.isAuthenticated?.() && isStaffUser(req.user);

/** Only admins and owners get past; everybody else gets the unknown-route answer (404). */
export const staffOnly = (req: Request, res: Response, next: NextFunction) => {
    if (callerIsStaff(req)) return next();
    if (req.isAuthenticated?.()) {
        logSecurityEvent({ type: 'AUTH_FAILURE', userId: (req.user as any)?.id, details: { reason: 'Staff route requested by non-staff', path: req.path } });
    }
    return sendApiNotFound(res);
};

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (!callerIsStaff(req)) return staffOnly(req, res, next);
    logSecurityEvent({ type: 'ADMIN_ACCESS', userId: (req.user as any).id, resource: req.path });
    next();
};

/** Owners only. Non-staff get the unknown-route answer (404), admins a 403. */
export const isOwner = (req: Request, res: Response, next: NextFunction) => {
    if (!callerIsStaff(req)) return staffOnly(req, res, next);
    const user = req.user as any;
    if (user.role !== 'owner') return res.status(403).json({ error: "Forbidden", code: "FORBIDDEN" });
    next();
};

export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
    if (req.isAuthenticated()) return next();
    res.status(401).send("Unauthorized");
};

/**
 * A staff route that needs one admin-group permission. Non-staff (and anonymous visitors) get the
 * unknown-route answer (404); staff without the permission get 403.
 */
export const hasPermission = (permission: string) => async (req: Request, res: Response, next: NextFunction) => {
    if (!callerIsStaff(req)) return staffOnly(req, res, next);
    const user = req.user as any;

    // Owners always have all permissions
    if (user.role === 'owner') return next();

    // Check group permissions
    if (user.adminGroupId) {
        try {
            const group = await storage.getAdminGroup(user.adminGroupId);
            if (group) {
                // Handle both stringified JSON and direct array if storage handles it
                const perms = typeof group.permissions === 'string' ? JSON.parse(group.permissions) : group.permissions;
                if (Array.isArray(perms) && perms.includes(permission)) return next();
            }
        } catch (e) {
            console.error("[AUTH] Failed to read permissions for group:", user.adminGroupId);
        }
    }

    // No group + No owner = No special permission access
    res.status(403).json({
        message: `Required permission missing: ${permission}`,
        code: 'PERMISSION_DENIED',
        permission
    });
};
