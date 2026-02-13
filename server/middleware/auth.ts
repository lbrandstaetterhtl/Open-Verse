import { Request, Response, NextFunction } from "express";
import { logSecurityEvent } from "../utils/logger";

// Standard Express Request with User type is handled by global declaration in auth.ts or similar
// assuming req.user is populated by passport

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
    console.log(`[AUTH-DEBUG] isAdmin middleware hit. Path: ${req.path}, Method: ${req.method}`);

    if (!req.isAuthenticated()) {
        console.log('[AUTH-DEBUG] isAdmin failed: User not authenticated');
        logSecurityEvent({ type: 'AUTH_FAILURE', details: { reason: 'Unauthenticated admin access attempt', path: req.path } });
        return res.status(401).send("Unauthorized");
    }

    // Check if req.user exists (TypeScript might complain if not guarded, though isAuthenticated checks it)
    const user = req.user as any;

    if (user.role !== 'admin' && user.role !== 'owner') {
        console.log(`[AUTH-DEBUG] isAdmin failed: Role mismatch. User role: ${user.role}`);
        logSecurityEvent({ type: 'AUTH_FAILURE', userId: user.id, details: { reason: 'Admin role required', role: user.role } });
        return res.status(403).send("Forbidden");
    }
    logSecurityEvent({ type: 'ADMIN_ACCESS', userId: user.id, resource: req.path });
    next();
};

export const isOwner = (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) return res.status(401).send("Unauthorized");

    const user = req.user as any;

    if (user.role !== 'owner') return res.status(403).send("Forbidden");
    next();
};

export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
    if (req.isAuthenticated()) return next();
    logSecurityEvent({ type: 'AUTH_FAILURE', details: { reason: 'Unauthorized access attempt', path: req.path, ip: req.ip } });
    res.status(401).send("Unauthorized");
};
