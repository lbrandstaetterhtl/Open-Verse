import type { Express } from "express";
import { createServer, type Server } from "http";
import session from 'express-session';
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { WebSocketServer } from 'ws';
import compression from "compression";

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
import adminRoutes from "./admin";
import ticketRoutes from "./tickets";
import monitoringRoutes from "./monitoring";
import { SettingsService } from "../services/settings";
import { monitoringMiddleware, slowQueryMiddleware } from "../middleware/monitoring";
import path from "path";
import xss from "xss";



export async function registerRoutes(app: Express): Promise<Server> {
    // 0. Performance: Compression
    app.use(compression());

    // 1. Security Headers (Helmet)
    const scriptSrcDirective = process.env.NODE_ENV === 'production'
        ? ["'self'"]
        : ["'self'", "'unsafe-inline'", "'unsafe-eval'"];
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                imgSrc: ["'self'", "data:", "blob:"],
                mediaSrc: ["'self'", "data:", "blob:"],
                scriptSrc: scriptSrcDirective,
                connectSrc: ["'self'", "ws:", "wss:"],
                frameAncestors: ["'none'"], // SEC-FIX: Correct CSP directive for clickjacking protection
            },
        },
        hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true
        }
    }));
    app.disable('x-powered-by');

    if (!process.env.SESSION_SECRET) {
        throw new Error("FATAL: SESSION_SECRET environment variable is required.");
    }

    // 2. HTTP Server & Session Parser
    const httpServer = createServer(app);
    const sessionParser = session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        store: storage.sessionStore,
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true, // SEC-FIX: Prevent XSS access to cookies
            sameSite: 'strict', // SEC-FIX: Strict CSRF protection
            maxAge: 1000 * 60 * 60 * 24 // 24 hours
        }
    });

    // 3. Setup Auth (Registers passport and populates req.user)
    setupAuth(app, sessionParser);

    // 4. Monitoring Middleware
    app.use(monitoringMiddleware);
    app.use(slowQueryMiddleware);

    // 5. Maintenance Mode Middleware
    // MUST be after setupAuth so req.user is available for staff bypass
    app.use(async (req, res, next) => {
        // Skip maintenance check for assets, auth, and public settings
        const isAuthRoute = req.path === "/api/login" || 
                           req.path === "/api/register" || 
                           req.path === "/api/logout" || 
                           req.path === "/api/user" || 
                           req.path === "/api/csrf-token";

        if (isAuthRoute || 
            req.path.startsWith("/api/public/settings") ||
            !req.path.startsWith("/api")) {
            return next();
        }

        const maintenanceMode = await SettingsService.get("general", "maintenance_mode", false);
        if (maintenanceMode) {
            const user = req.user as any;
            const isAdmin = user && (user.isAdmin || user.role === "admin" || user.role === "owner");
            
            if (!isAdmin) {
                return res.status(503).json({ 
                    message: "Site is currently under maintenance. Please check back later.",
                    maintenance: true 
                });
            }
        }
        next();
    });

    // 5. CSRF Endpoint
    app.get("/api/csrf-token", (req, res) => {
        res.json({ csrfToken: (req.session as any)?.csrfToken });
    });

    // 6. Public Settings Endpoint
    app.get("/api/public/settings", async (req, res) => {
        try {
            const keys = ["site_name", "maintenance_mode", "registration_enabled", "site_description"];
            const settings: Record<string, any> = {};
            
            for (const key of keys) {
                const category = key.includes("registration") ? "users" : "general";
                settings[key] = await SettingsService.get(category, key);
            }
            
            res.json(settings);
        } catch (error) {
            console.error("Failed to fetch public settings:", error);
            res.status(500).json({ error: "Failed to fetch settings" });
        }
    });

    // 7. Protected Routes & Features
    app.use("/api", validateCsrf);

    const apiLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 1000,
        message: "Too many requests from this IP, please try again later",
    });
    app.use("/api", apiLimiter);

    app.get("/api/feed/communities", async (req, res) => {
        if (!req.isAuthenticated()) {
            return res.status(401).send("Unauthorized");
        }
        try {
            const userId = (req.user as any).id;
            const posts = await storage.getCommunityFeedPosts(userId);
            
            // Enrich posts with author and reaction details
            const authorIds = [...new Set(posts.map(p => p.authorId))];
            const authors = await storage.getUsersByIds(authorIds);
            const authorsMap = new Map(authors.map(u => [u.id, u]));

            const postsWithDetails = await Promise.all(posts.map(async (post) => {
                const author = authorsMap.get(post.authorId);
                const isFollowing = await storage.isFollowing(userId, post.authorId);
                const reactions = await storage.getPostReactions(post.id);
                const userReaction = await storage.getUserPostReaction(userId, post.id);

                return {
                    ...post,
                    author: {
                        id: author?.id,
                        username: author?.username || 'Unknown',
                        verified: author?.verified || false,
                        isFollowing,
                        role: author?.role || 'member'
                    },
                    reactions,
                    userReaction
                };
            }));

            res.json(postsWithDetails);
        } catch (error) {
            console.error("Error fetching community feed:", error);
            res.status(500).send("Failed to fetch community feed");
        }
    });

    app.use("/api/ai", aiRoutes);
    app.use("/api/posts", postsRoutes);
    app.use("/api/comments", commentsRoutes);
    app.use("/api/communities", communityRoutes);
    app.use("/api/reports", reportRoutes);
    app.use("/api/admin/monitoring", monitoringRoutes);
    app.use("/api/admin", adminRoutes);
    app.use("/api/tickets", ticketRoutes);
    app.use("/api/messages", messageRoutes);
    app.use("/api/notifications", notificationRoutes);
    app.use("/api/user/themes", themeRoutes);
    app.use("/api", userRoutes);

    // 8. WebSocket Setup
    const wss = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (req, socket, head) => {
        const url = new URL(req.url || '', `http://${req.headers.host}`);
        if (url.pathname === '/ws') {
            sessionParser(req as any, {} as any, () => {
                const session = (req as any).session;
                const userId = session?.passport?.user;
                if (!userId) {
                    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                    socket.destroy();
                    return;
                }
                wss.handleUpgrade(req, socket, head, (ws) => {
                    wss.emit('connection', ws, req);
                });
            });
        }
    });

    wss.on('connection', (ws, req: any) => {
        const session = req.session;
        const userId = session?.passport?.user;

        if (!userId) {
            console.warn("[WS] Connection attempted without valid session/user");
            ws.close(1008, "Unauthorized");
            return;
        }

        connections.set(userId, ws);

        ws.on('close', () => {
            connections.delete(userId);
        });
    });

    return httpServer;
}
