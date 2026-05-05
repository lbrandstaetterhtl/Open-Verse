import type { Express } from "express";
import { createServer, type Server } from "node:http";
import session from 'express-session';
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { WebSocketServer } from 'ws';
import compression from "compression";

import { setupAuth, validateCsrf } from "../auth";
import { storage } from "../storage";
import { connections } from "../services/websocket";
import { banCheckMiddleware } from "../middleware/ban-check";

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
import analyticsRoutes from "./analytics";
import modPerformanceRoutes from "./mod-performance";
import securityRoutes from "./security";
import { SettingsService } from "../services/settings";
import { monitoringMiddleware, slowQueryMiddleware } from "../middleware/monitoring";
import { logger } from "../logger";
import { dbLogger } from "../logger/service-loggers";



import { DbHealthService } from "../services/db-health";

export async function registerRoutes(app: Express): Promise<Server> {
    // 0. Performance: Compression
    app.use(compression());

    // 0.5. DB Health Check Middleware
    app.use(async (req, res, next) => {
        // Skip health check for public assets (files with extensions) and non-API routes
        // EXCEPT for the root "/" which we want to check
        const isStaticFile = req.path.includes(".");
        const isApiRoute = req.path.startsWith("/api");

        if (!isApiRoute && isStaticFile) {
            return next();
        }

        // We only check health for API routes and the main entry points
        const health = await DbHealthService.checkHealth();
        if (!health.isHealthy) {
            // We need to check if user is admin, but req.user might not be populated yet
            // However, we can check the session later or just show a friendly error first
            // and a detailed one if they are on an admin route
            const isAdminRoute = req.path.startsWith("/api/admin") || req.path.startsWith("/admin");
            
            // At this stage req.user is NOT yet available (setupAuth runs later)
            // So we show the friendly error, but for the /api/admin paths we could try to be more detailed
            // if we really wanted to. For now, let's keep it simple:
            
            if (req.path.startsWith("/api")) {
                return res.status(503).json({
                    error: "Database Unavailable",
                    message: "The system is currently unable to communicate with the database.",
                    details: isAdminRoute ? health.details : undefined
                });
            } else {
                // Return a simple HTML error page if it's a direct browser request
                return res.status(503).send(`
                    <html>
                        <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: white; text-align: center;">
                            <div>
                                <h1 style="font-size: 3rem; margin-bottom: 1rem;">🗄️ Database Issue</h1>
                                <p style="font-size: 1.2rem; opacity: 0.8;">The platform is temporarily unavailable due to a database connection issue.</p>
                                ${isAdminRoute ? `<div style="margin-top: 2rem; padding: 1rem; background: #ef444420; border: 1px solid #ef444440; border-radius: 8px; color: #ef4444; font-family: monospace;">${health.details}</div>` : ""}
                                <p style="margin-top: 2rem; font-size: 0.9rem; opacity: 0.5;">Our engineers have been notified.</p>
                            </div>
                        </body>
                    </html>
                `);
            }
        }
        next();
    });

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
                frameAncestors: ["'none'"],
                objectSrc: ["'none'"], // SEC-FIX: Block plugins
                upgradeInsecureRequests: null, // EXPLIZIT deaktivieren (sonst ist es per Default an)
            },
        },
        hsts: false, // EXPLIZIT deaktivieren (sonst ist es per Default an)
        referrerPolicy: { policy: "strict-origin-when-cross-origin" }
    }));

    // SEC-FIX [SEC-011]: Permissions-Policy to disable unneeded browser features
    app.use((req, res, next) => {
        res.setHeader(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=(), interest-cohort=()"
        );
        next();
    });
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
            secure: process.env.REQUIRE_HTTPS === 'true', // Muss 'true' sein, wenn ein HTTPS Reverse Proxy genutzt wird
            httpOnly: true, // SEC-FIX: Prevent XSS access to cookies
            sameSite: 'lax', // Geändert von 'strict' für besseres lokales Testen
            maxAge: 1000 * 60 * 60 * 24 // 24 hours
        }
    });

    // 3. Setup Auth (Registers passport and populates req.user)
    setupAuth(app, sessionParser);

    // 3.5. Security & Ban Check Middleware (Block IPs, Devices, Accounts)
    app.use(banCheckMiddleware);

    // 4. Monitoring Middleware
    app.use(monitoringMiddleware);
    app.use(slowQueryMiddleware);

    // 5. Maintenance Mode Middleware
    // MUST be after setupAuth so req.user is available for staff bypass
    app.use(async (req, res, next) => {
        const maintenanceMode = await SettingsService.get("general", "maintenance_mode", false);
        
        // Skip maintenance check for assets and public settings
        if (req.path.startsWith("/api/public/settings") || !req.path.startsWith("/api")) {
            return next();
        }

        if (maintenanceMode) {
            // Block registration entirely during maintenance
            if (req.path === "/api/register") {
                return res.status(503).json({ 
                    message: "Registration is temporarily disabled during maintenance.",
                    maintenance: true 
                });
            }

            // Allow other auth routes (login, logout, user) to proceed to auth logic
            const isAuthRoute = req.path === "/api/login" || 
                               req.path === "/api/logout" || 
                               req.path === "/api/user" || 
                               req.path === "/api/csrf-token";

            if (isAuthRoute) {
                return next();
            }

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
            
            const settingsArray = await Promise.all(keys.map(async (key) => {
                const category = key.includes("registration") ? "users" : "general";
                return { key, value: await SettingsService.get(category, key) };
            }));
            
            settingsArray.forEach(({ key, value }) => {
                settings[key] = value;
            });
            
            res.json(settings);
        } catch (error) {
            logger.error('error', "Failed to fetch public settings", error);
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
            const limit = parseInt(req.query.limit as string) || 50;
            const offset = parseInt(req.query.offset as string) || 0;

            const posts = await storage.getCommunityFeedPosts(userId, { limit, offset });
            
            // Enrich posts with author and reaction details
            const authorIds = [...new Set(posts.map(p => p.authorId))];
            const authors = await storage.getUsersByIds(authorIds);
            const authorsMap = new Map(authors.map(u => [u.id, u]));

            // PERF-FIX [OPT-002]: Batch fetch reactions (Prevents N+1)
            const postIds = posts.map(p => p.id);
            const batchReactions = await storage.getBatchPostReactions(postIds);

            const postsWithDetails = await Promise.all(posts.map(async (post) => {
                const author = authorsMap.get(post.authorId);
                // TODO: Batch this too in next iteration
                const isFollowing = await storage.isFollowing(userId, post.authorId);
                const reactions = batchReactions.get(post.id) || { likes: 0, dislikes: 0 };
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
            logger.error('error', "Error fetching community feed", error, { userId });
            res.status(500).send("Failed to fetch community feed");
        }
    });

    app.use("/api/ai", aiRoutes);
    app.use("/api/posts", postsRoutes);
    app.use("/api/comments", commentsRoutes);
    app.use("/api/communities", communityRoutes);
    app.use("/api/reports", reportRoutes);
    app.use("/api/admin/monitoring", monitoringRoutes);
    app.use("/api/admin/analytics", analyticsRoutes);
    app.use("/api/admin/performance", modPerformanceRoutes);
    app.use("/api/admin", adminRoutes);
    app.use("/api/security", securityRoutes);
    app.use("/api/tickets", ticketRoutes);
    app.use("/api/messages", messageRoutes);
    app.use("/api/notifications", notificationRoutes);
    app.use("/api/user/themes", themeRoutes);
    app.use("/api/users", userRoutes);
    app.use("/api/user", userRoutes);
    app.use("/api", userRoutes); // Fallback for any other legacy routes

    // 8. WebSocket Setup
    const wss = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (req, socket, head) => {
        const url = new URL(req.url || '', `http://${req.headers.host}`);
        
        // SEC-FIX [SEC-006]: Strict Origin Validation to prevent CSWSH
        const origin = req.headers.origin;
        const host = req.headers.host;
        
        if (origin) {
            const originUrl = new URL(origin);
            const isLocalhost = originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1';
            const matchesHost = host && originUrl.host === host;

            if (!matchesHost && !isLocalhost) {
                logger.warn('security', `Blocked WebSocket upgrade from unauthorized origin: ${origin}`, { origin, host });
                socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
                socket.destroy();
                return;
            }
        }

        if (url.pathname === '/ws') {
            sessionParser(req as any, {} as any, () => {
                const currentSession = (req as any).session;
                const userId = currentSession?.passport?.user;
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
        const currentSession = req.session;
        const userId = currentSession?.passport?.user;

        if (!userId) {
            logger.warn('security', "[WS] Connection attempted without valid session/user");
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
