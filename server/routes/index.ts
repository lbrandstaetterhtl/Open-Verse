import type { Express } from "express";
import { createServer, type Server } from "http";
import session from 'express-session';
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { WebSocketServer } from 'ws';

import { setupAuth, validateCsrf } from "../auth";
import { storage } from "../storage";
import { connections } from "../services/websocket";
import { logSecurityEvent } from "../utils/logger";

// Feature Routes
import aiRoutes from "./ai";
import postsRoutes from "./posts";
import commentsRoutes from "./comments";
import communityRoutes from "./communities";
import reportRoutes from "./reports";
import themeRoutes from "./themes";
import messageRoutes from "./messages";
import notificationRoutes from "./notifications";
import userRoutes from "./users";
import path from "path";


export async function registerRoutes(app: Express): Promise<Server> {
    // Security Headers
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                imgSrc: ["'self'", "data:", "blob:"],
                mediaSrc: ["'self'", "data:", "blob:"],
                scriptSrc: ["'self'", "'unsafe-inline'"],
                connectSrc: ["'self'", "ws:", "wss:"],
            },
        },
    }));
    app.disable('x-powered-by');

    // Session Secret Check
    if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
        throw new Error("FATAL: SESSION_SECRET environment variable is required in production.");
    }

    // Create HTTP server
    const httpServer = createServer(app);

    // Setup session parser
    const sessionParser = session({
        secret: process.env.SESSION_SECRET || 'your-secret-key',
        resave: false,
        saveUninitialized: false,
        store: storage.sessionStore,
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 1000 * 60 * 60 * 24 // 24 hours
        }
    });

    // Setup auth with session parser
    setupAuth(app, sessionParser);

    // CSRF Endpoint
    app.get("/api/csrf-token", (req, res) => {
        res.json({ csrfToken: (req.session as any)?.csrfToken });
    });

    // Apply CSRF Protection to API
    app.use("/api", validateCsrf);

    // Global API Rate Limiter
    const apiLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 1000,
        message: "Too many requests from this IP, please try again later",
        skip: (req) => {
            if (req.path.startsWith('/api/ai/')) return true;
            if (req.headers['x-auto-refresh'] === 'true') return true;
            return false;
        }
    });
    app.use("/api", apiLimiter);

    // Mount Feature Routes
    app.use("/api/ai", aiRoutes);
    app.use("/api/posts", postsRoutes); // Handles /api/posts and /api/posts/:id
    app.use("/api/comments", commentsRoutes); // Handles main comment operations
    app.use("/api/communities", communityRoutes);
    app.use("/api/reports", reportRoutes); // Admin reports

    // User related routes (a bit scattered)
    // We have messages, notifications, themes.
    app.use("/api/messages", messageRoutes);
    app.use("/api/notifications", notificationRoutes);
    app.use("/api/user/themes", themeRoutes); // Matches /api/user/themes

    // Users routes is a mix of /api/follow, /api/followers, /api/users/:username...
    // We can mount it at /api and let it handle the subpaths, or mount at /api/users?
    // users.ts handles: /follow/:userId, /followers, /following, /:username/posts...
    // If we mount at /api/users, then /follow becomes /api/users/follow... which breaks API contract.
    // We need to be careful.
    app.use("/api", userRoutes);

    // Setup WebSocket server
    const wss = new WebSocketServer({
        server: httpServer,
        path: '/ws',
        verifyClient: (info, done) => {
            sessionParser(info.req as any, {} as any, () => {
                const session = (info.req as any).session;
                const userId = session?.passport?.user;
                if (userId) {
                    done(true);
                } else {
                    done(false, 401, "Unauthorized");
                }
            });
        }
    });

    wss.on('connection', (ws, req: any) => {
        const userId = req.session.passport.user;
        connections.set(userId, ws);

        ws.on('close', () => {
            connections.delete(userId);
        });
    });

    return httpServer;
}
