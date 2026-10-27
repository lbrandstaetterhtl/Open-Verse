import type { Express } from "express";
import { createServer, type Server } from "node:http";
import session from 'express-session';
import rateLimit from "express-rate-limit";
import { WebSocketServer } from 'ws';

import { setupSession, registerAuthRoutes, validateCsrf, isAccountBanned, createCsrfToken } from "../auth";
import { staffOnly, sendApiNotFound } from "../middleware/auth";
import { staffAssetGuard, isStaffAssetPath } from "../staff-assets";
import { storage } from "../storage";
import { addConnection, removeConnection } from "../services/websocket";
import { passwordStamp } from "../utils/password-hash";
import { isAllowedOrigin } from "../utils/origins";
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
import adminGroupRoutes from "./admin-groups";
import monitoringRoutes from "./monitoring";
import analyticsRoutes from "./analytics";
import modPerformanceRoutes from "./mod-performance";
import securityRoutes from "./security";
import { SettingsService } from "../services/settings";
import { monitoringMiddleware, slowQueryMiddleware } from "../middleware/monitoring";
import { logger } from "../logger";
import { dbLogger } from "../logger/service-loggers";



import { DbHealthService } from "../services/db-health";
import { parsePagination } from "../utils/pagination";
import { DELETED_AUTHOR } from "../utils/post-extras";
import { filterVisiblePosts, shadowCountScope } from "../utils/community-access";

/** Shown to browser navigations while the database is unreachable. No details: they are only in the log. */
const DB_UNAVAILABLE_PAGE = `                    <html>
                        <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: white; text-align: center;">
                            <div>
                                <h1 style="font-size: 3rem; margin-bottom: 1rem;">Database Issue</h1>
                                <p style="font-size: 1.2rem; opacity: 0.8;">The platform is temporarily unavailable due to a database connection issue.</p>
                                <p style="margin-top: 2rem; font-size: 0.9rem; opacity: 0.5;">Please try again in a few minutes.</p>
                            </div>
                        </body>
                    </html>
                `;

export async function registerRoutes(app: Express): Promise<Server> {
    // Compression is applied once in server/index.ts

    // 0.5. DB Health Check Middleware. The answer is the same for every path and every caller: what exactly
    // is wrong (missing tables, the driver's error text) only goes to the server log (DbHealthService logs it).
    app.use(async (req, res, next) => {
        // Skip health check for public assets (files with extensions) and non-API routes
        // EXCEPT for the root "/" which we want to check
        const isStaticFile = req.path.includes(".");
        const isApiRoute = req.path.startsWith("/api");

        if (!isApiRoute && isStaticFile) {
            return next();
        }

        const health = await DbHealthService.checkHealth();
        if (!health.isHealthy) {
            if (isApiRoute) {
                return res.status(503).json({
                    error: "Database Unavailable",
                    message: "The system is currently unable to communicate with the database.",
                });
            }
            // A simple HTML error page for direct browser requests (same for every caller)
            return res.status(503).type("html").send(DB_UNAVAILABLE_PAGE);
        }
        next();
    });

    // 1. Security headers (helmet) are set once for the whole app in server/index.ts

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
        // No session row and no cookie for visitors that never needed one: a session is stored once something
        // is put into it (login, registration, or the CSRF token from GET /api/csrf-token).
        saveUninitialized: false,
        store: storage.sessionStore,
        cookie: {
            // REQUIRE_HTTPS=true: always Secure. Otherwise "auto": Secure whenever the request came over HTTPS,
            // directly or via a trusted proxy's X-Forwarded-Proto (TRUST_PROXY), and still usable over plain
            // HTTP on localhost.
            secure: process.env.REQUIRE_HTTPS === 'true' ? true : 'auto',
            httpOnly: true, // SEC-FIX: Prevent XSS access to cookies
            sameSite: 'lax', // Geändert von 'strict' für besseres lokales Testen
            maxAge: 1000 * 60 * 60 * 24 // 24 hours
        }
    });

    // 2.5. One per-IP budget for the whole API, counted before anything else touches the session store or the
    // database: also /api/csrf-token and requests that fail the CSRF check (403 floods) use it up. No
    // X-RateLimit-* headers (they would publish the thresholds); clients only see the 429.
    const apiLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 1000,
        standardHeaders: false,
        legacyHeaders: false,
        message: { error: "Too many requests from this IP, please try again later", code: "RATE_LIMITED" },
    });
    app.use("/api", apiLimiter);

    // 3. Session + passport (populates req.user) for the API and for the staff-only static files (their guard
    // needs the role). Public static files (assets, translations, images) and the app's HTML never read or
    // write the session store. The auth routes themselves are registered further down, after the ban check,
    // maintenance mode and CSRF validation, so those apply to login, registration, logout and the profile
    // routes too.
    setupSession(app, sessionParser, (req) => req.path.startsWith("/api") || isStaffAssetPath(req.path));

    // 3.2. Staff-only static files (assets/staff-*.js, staff translation namespaces): 404 unless the session
    // belongs to an admin or owner. Must run before express.static (server/vite.ts serveStatic).
    app.use(staffAssetGuard);

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
                    error: "Registration is temporarily disabled during maintenance.",
                    code: "MAINTENANCE_REGISTRATION",
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
                    error: "Site is currently under maintenance. Please check back later.",
                    code: "MAINTENANCE",
                    maintenance: true
                });
            }
        }
        next();
    });

    // 5. CSRF Endpoint. The token is created here, on first use, so the session (row + cookie) only exists
    // for visitors that are about to send a state-changing request (the client fetches it right before).
    app.get("/api/csrf-token", (req, res) => {
        const s = req.session as any;
        if (!s.csrfToken) s.csrfToken = createCsrfToken();
        res.json({ csrfToken: s.csrfToken });
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

    // 7. Protected Routes & Features (the API rate limit above already counted this request)
    app.use("/api", validateCsrf);

    // Login, registration, logout, own profile and password
    registerAuthRoutes(app);

    // Staff areas are invisible to everybody else: anonymous visitors and users who are not staff get the
    // same answer as for an API path that does not exist (404 {"error":"Not found"}), so they cannot tell
    // which staff routes exist. Staff without a route's permission still get 403 from hasPermission.
    app.use(["/api/admin", "/api/security", "/api/monitoring"], staffOnly);

    // Admin IP allowlist (setting security.admin_ip_allowlist, comma-separated; empty = off)
    app.use("/api/admin", async (req, res, next) => {
        try {
            const raw = String((await SettingsService.get("security", "admin_ip_allowlist", "")) ?? "");
            const allowed = raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
            if (allowed.length === 0) return next();
            const ip = (req.ip || "").replace(/^::ffff:/, "");
            if (allowed.some((a) => a.replace(/^::ffff:/, "") === ip)) return next();
            logger.warn('security', "Admin request from an address outside admin_ip_allowlist", { ip, path: req.path });
            return res.status(403).json({ error: "Forbidden" });
        } catch (err) {
            logger.error('security', "admin_ip_allowlist check failed", err);
            return next();
        }
    });

    app.get("/api/feed/communities", async (req, res) => {
        if (!req.isAuthenticated()) {
            return res.status(401).send("Unauthorized");
        }
        const userId = (req.user as any).id;
        try {
            const { limit, offset } = parsePagination(req.query);

            // Same visibility rule as every other post list (shadow-banned authors, private communities)
            const posts = await filterVisiblePosts(req, await storage.getCommunityFeedPosts(userId, { limit, offset }));
            
            // Enrich posts with author and reaction details
            const authorIds = [...new Set(posts.map(p => p.authorId))];
            const authors = await storage.getUsersByIds(authorIds);
            const authorsMap = new Map(authors.map(u => [u.id, u]));

            // PERF-FIX [OPT-002]: Batch fetch reactions (Prevents N+1)
            const postIds = posts.map(p => p.id);
            const batchReactions = await storage.getContentStore().getBatchPostReactions(postIds, shadowCountScope(req));

            const postsWithDetails = await Promise.all(posts.map(async (post) => {
                const author = authorsMap.get(post.authorId);
                // TODO: Batch this too in next iteration
                const isFollowing = await storage.isFollowing(userId, post.authorId);
                const reactions = batchReactions.get(post.id) || { likes: 0, dislikes: 0 };
                const userReaction = await storage.getUserPostReaction(userId, post.id);

                return {
                    ...post,
                    author: author
                        ? { id: author.id, username: author.username, verified: author.verified || false, isFollowing, role: author.role || 'member' }
                        : DELETED_AUTHOR,
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
    app.use("/api/admin/groups", adminGroupRoutes);
    app.use("/api/admin", adminRoutes);
    app.use("/api/security", securityRoutes);
    app.use("/api/tickets", ticketRoutes);
    app.use("/api/messages", messageRoutes);
    app.use("/api/notifications", notificationRoutes);
    app.use("/api/user/themes", themeRoutes);
    app.use("/api/users", userRoutes);
    app.use("/api/user", userRoutes);
    // Legacy short paths of the users router (/api/follow/:id, /api/followers, /api/following, /api/search,
    // /api/profile-upload). Its /:username routes only answer under /api/users (see users.ts), so unknown
    // /api/<x> paths are not mistaken for usernames.
    app.use("/api", userRoutes);

    // Every other /api path: one generic answer (also what non-staff get for staff routes).
    app.use("/api", (_req, res) => sendApiNotFound(res));

    // 8. WebSocket Setup
    // The server never reads client frames, so 64 KiB is plenty (the ws default would buffer up to 100 MiB).
    const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
    wss.on('error', (err) => logger.error('security', "[WS] server error", err));

    httpServer.on('upgrade', (req, socket, head) => {
        // Any throw in here would be an uncaught exception, so everything is guarded.
        socket.on('error', () => socket.destroy());
        const reject = (status: string) => {
            try {
                socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
            } catch { /* socket already gone */ }
            socket.destroy();
        };
        let url: URL;
        try {
            url = new URL(req.url || '/', 'http://localhost');
        } catch {
            return reject('400 Bad Request');
        }

        if (url.pathname !== '/ws') {
            // In development Vite's HMR server listens for its own upgrades on this server
            if (process.env.NODE_ENV === 'development') return;
            return reject('404 Not Found');
        }

        // SEC-FIX [SEC-006]: Origin validation against CSWSH. Browsers always send Origin on a WebSocket
        // handshake; a request without one cannot come from a hostile web page, and it still needs a valid
        // session cookie below.
        const origin = req.headers.origin;
        if (origin !== undefined && !isAllowedOrigin(origin, req)) {
            logger.warn('security', `Blocked WebSocket upgrade from unauthorized origin`, { origin, host: req.headers.host });
            return reject('403 Forbidden');
        }

        sessionParser(req as any, {} as any, async () => {
            try {
                const currentSession = (req as any).session;
                const userId = currentSession?.passport?.user;
                if (!userId) return reject('401 Unauthorized');
                // Same checks as for HTTP requests: the session must belong to the current password and the
                // account must not be banned or deleted.
                const user = await storage.getUser(userId);
                if (!user || currentSession.authStamp !== passwordStamp(user.password) || (await isAccountBanned(user))) {
                    return reject('401 Unauthorized');
                }
                wss.handleUpgrade(req, socket, head, (ws) => {
                    wss.emit('connection', ws, req);
                });
            } catch (err) {
                logger.error('security', "[WS] upgrade failed", err);
                reject('500 Internal Server Error');
            }
        });
    });

    wss.on('connection', (ws, req: any) => {
        const currentSession = req.session;
        const userId = currentSession?.passport?.user;

        // A protocol error from the client (bad opcode, oversized frame, …) must only close this socket.
        // Without a listener ws re-emits it as an uncaught exception.
        ws.on('error', (err) => {
            logger.warn('security', "[WS] client protocol error, closing socket", { userId, error: String((err as any)?.message ?? err) });
            ws.terminate();
        });

        if (!userId) {
            logger.warn('security', "[WS] Connection attempted without valid session/user");
            ws.close(1008, "Unauthorized");
            return;
        }

        // One entry per tab: closing one tab only removes that socket
        addConnection(userId, ws, req.sessionID);

        ws.on('close', () => {
            removeConnection(userId, ws);
        });
    });

    return httpServer;
}
