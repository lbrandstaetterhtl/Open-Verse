import type { Response, NextFunction } from "express";
import express, { type Request } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { SettingsService } from "./services/settings";
import { analyticsService } from "./services/analytics-service";
import { moderatorPerformanceService } from "./services/moderator-performance-service";
import { subDays } from "date-fns";
import { closeDb } from "./db";
import fs from "node:fs";
import path from "node:path";
import helmet from "helmet";
import cors from "cors";
import { logger } from "./logger";
import compression from "compression";
import { requestLoggerMiddleware } from "./middleware/request-logger";
import { globalErrorHandler } from "./middleware/error-handler";
import { dbLogger } from "./logger/service-loggers";
import { isAllowedOrigin } from "./utils/origins";


const app = express();
app.use(compression());

// PRODUCTION SECURITY [SEC-001]: Which X-Forwarded-For / X-Forwarded-Proto headers to believe (req.ip,
// req.secure, Secure cookies, rate limits, IP bans).
//   TRUST_PROXY=true  -> only proxies on loopback / private / link-local addresses (nginx on the host or in the
//                        docker network). A client that connects to port 5000 directly from the internet cannot
//                        choose its own address with X-Forwarded-For.
//   TRUST_PROXY=<n>   -> exactly n proxy hops; TRUST_PROXY=<list> -> those addresses/subnets (express syntax).
const trustProxy = process.env.TRUST_PROXY?.trim();
if (trustProxy === "true") {
  app.set("trust proxy", "loopback, linklocal, uniquelocal");
} else if (trustProxy && trustProxy !== "false") {
  app.set("trust proxy", /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
}

// SECURITY-FIX [SEC-001]: Security headers, one policy for every response (app document, API, uploads).
const isDevelopment = process.env.NODE_ENV === "development";
const safeHost = (req: any) => {
  const host = String(req.headers?.host ?? "");
  return /^[a-z0-9.\-]+(:\d+)?$/i.test(host) || /^\[[0-9a-f:.]+\](:\d+)?$/i.test(host) ? host : null;
};
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "data:", "blob:"],
      // The app's own fonts are self-hosted (client/src/fonts). Google Fonts stay allowed only because the
      // theme builder lets a user pick optional fonts that are loaded from there (client/src/lib/theme-utils.ts);
      // narrower than helmet's default "https:".
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      // Vite's dev server needs inline/eval; production bundles do not
      scriptSrc: isDevelopment ? ["'self'", "'unsafe-inline'", "'unsafe-eval'"] : ["'self'"],
      // WebSockets only to this host (ws:/wss: alone would allow any host)
      connectSrc: ["'self'", (req: any) => { const h = safeHost(req); return h ? `ws://${h}` : "'self'"; }, (req: any) => { const h = safeHost(req); return h ? `wss://${h}` : "'self'"; }],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: null,
    },
  },
  crossOriginEmbedderPolicy: false, // Required for some media loads
  hsts: false,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));

// SECURITY-FIX [SEC-005]: CORS only for the app's own origin and CORS_ORIGINS (never "null" / any origin)
app.use(cors((req, cb) => {
  const origin = req.headers.origin;
  cb(null, { origin: isAllowedOrigin(origin, req) ? origin : false, credentials: true });
}));

app.use(express.json({ limit: "1mb" }));
// No urlencoded parser: the client only sends JSON and multipart, and form bodies would let a plain
// cross-site <form> post to the API without a CORS preflight.

// Ensure uploads directory exists and set proper permissions
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  logger.info('system', "Created uploads directory", { path: uploadsDir });
} else {
  logger.info('system', "Uploads directory already exists", { path: uploadsDir });
}

// SEC-005: Hardened Static Serving for Uploads
app.use(
  "/uploads",
  (req, res, next) => {
    const fullPath = path.join(uploadsDir, req.path);
    const exists = fs.existsSync(fullPath);
    logger.debug(`Upload request: ${req.method} ${req.path.slice(0, 200)}`, { exists });

    // Uploaded files are never documents that run code
    res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self' data: blob:; media-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; sandbox");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Accel-Buffering", "no"); // For better streaming
    next();
  },
  express.static(uploadsDir, {
    index: false,
    redirect: false,
    dotfiles: 'ignore',
    fallthrough: false // This will error if file not found, which we want for debugging
  }),
);


// DOCKER [HEALTH-001]: Health check endpoint for Docker/load-balancer probes
// Only "ok": uptime, versions or timings would tell anyone when the service was (re)started.
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});


// Add professional request logging middleware
app.use(requestLoggerMiddleware);

// Validate required environment variables
const useSqlite = process.env.USE_SQLITE === "true";
const requiredEnvVars = useSqlite
  ? ["SESSION_SECRET"] // SQLite doesn't need DATABASE_URL
  : ["SESSION_SECRET", "DATABASE_URL"]; // Neon needs DATABASE_URL

const missingEnvVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingEnvVars.length > 0) {
  logger.critical('system', "Missing required environment variables", { missing: missingEnvVars });
  process.exit(1);
}

// Check optional SendGrid configuration
if (!process.env.SENDGRID_API_KEY) {
  logger.warn('system', "SENDGRID_API_KEY not configured - email verification will be skipped");
} else if (!process.env.SENDGRID_API_KEY.startsWith("SG.")) {
  logger.warn('system', "SENDGRID_API_KEY is invalid - email verification will be skipped");
}

// Register routes
(async () => {
  try {
    logger.info('system', "Starting server...");
    console.log("DEBUG: Application startup sequence initiated");

    // MIGRATION [POSTGRES-FIX]: Run Drizzle migrations first
    // This MUST run before any other DB operations
    console.log("DEBUG: About to import migration runner...");
    try {
      const { runMigrations } = await import("./db-migrations");
      console.log("DEBUG: Migration runner imported, executing migrations...");
      await runMigrations();
      console.log("DEBUG: Migrations completed successfully");
    } catch (migrationErr: any) {
      console.error("ERROR during migrations:", migrationErr);
      throw migrationErr;
    }

    // MIGRATION [POSTGRES-FIX]: Ensure schema consistency (adds missing columns)
    const { ensurePostgresColumns } = await import("./migrations/ensure_postgres_columns");
    await ensurePostgresColumns();

    // Usernames and emails are unique regardless of case (indexes on lower(...))
    const { ensureCaseInsensitiveUserUniqueness } = await import("./migrations/user_case_uniqueness");
    await ensureCaseInsensitiveUserUniqueness();

    // Owner bootstrap from INITIAL_OWNER_* (needs the final users table)
    const { bootstrapAccounts } = await import("./db-migrations");
    await bootstrapAccounts();

    // FEATURE [AS-009]: Initialize system settings
    await SettingsService.seed();
    
    // One-time fix: Ensure site name is Osiris if it's currently Open-Verse
    const currentSiteName = await SettingsService.get("general", "site_name");
    if (currentSiteName === "Open-Verse") {
      logger.info('system', "Auto-correcting site name to Osiris in database...");
      // Use a mock request object for logging
      const systemReq = { user: { id: 0, username: 'system' } } as any;
      await SettingsService.set(systemReq, "general", "site_name", "Osiris");
      await SettingsService.set(systemReq, "appearance", "custom_footer_text", "© 2024 Osiris. All rights reserved.");
      await SettingsService.set(systemReq, "general", "support_email", "support@osiris.com");
      SettingsService.clearCache();
    }
    
    // TICKET SYSTEM: Initialize Database Tables
    const { addTicketSystem } = await import("./migrations/add_ticket_system");
    await addTicketSystem();
    
    // MODERATOR PERFORMANCE: Initialize Database Tables
    const { addModeratorPerformanceSystem } = await import("./migrations/add_moderator_performance");
    await addModeratorPerformanceSystem();

    // AUTO-PUNISHMENT: Initialize Default Rules
    const { seedDefaultRules } = await import("./services/auto-punishment-defaults");
    await seedDefaultRules();

    // ANALYTICS: Run initial bootstrap (compute last 7 days if empty)
    const latestSnapshot = await analyticsService.getLatestSnapshot();
    if (!latestSnapshot) {
      logger.info('system', "[Analytics] No snapshots found, bootstrapping last 7 days...");
      for (let i = 7; i >= 1; i--) {
        try {
          await analyticsService.computeDailySnapshot(subDays(new Date(), i));
        } catch (e) {
          logger.error('error', `[Analytics] Failed bootstrap for -${i} days`, e);
        }
      }
    }
    
    // MODERATOR PERFORMANCE: Initial bootstrap
    logger.info('system', "[ModPerf] Bootstrapping initial performance snapshots...");
    for (let i = 7; i >= 0; i--) {
      try {
        await moderatorPerformanceService.computeDailySnapshot(
          subDays(new Date(), i).toISOString().slice(0, 10)
        );
      } catch (e) {
        logger.error('error', `[ModPerf] Bootstrap for -${i} days failed`, e);
      }
    }

    // ANALYTICS: Schedule daily snapshot at 00:05
    setInterval(async () => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 5) {
        logger.info('system', "[Analytics] Running scheduled daily snapshot...");
        try {
          await analyticsService.computeDailySnapshot(subDays(new Date(), 1));
          await moderatorPerformanceService.computeDailySnapshot(
            subDays(new Date(), 1).toISOString().slice(0, 10)
          );
        } catch (e) {
          logger.error('error', "[Analytics] Scheduled snapshot failed", e);
        }
      }
    }, 60 * 1000); // Check every minute
    
    const server = await registerRoutes(app);

    // SECURITY-FIX [SEC-002]: Professional Global Error Handler
    app.use(globalErrorHandler);

    // The Vite dev server (raw sources, no CSP for scripts) only with an explicit NODE_ENV=development;
    // an unset NODE_ENV serves the built client like production.
    if (process.env.NODE_ENV === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    const port = parseInt(process.env.PORT || "5000");
    const host = process.env.HOST || "0.0.0.0";
    
    server.listen(port, host, () => {
      logger.info('system', `Server started successfully on ${host}:${port} (${app.get("env")} mode)`, { host, port, env: app.get("env") });
    });

    // Handle server errors
    server.on("error", (error: any) => {
      logger.critical('system', "Server error", error);
      process.exit(1);
    });

    // STABILITY-FIX [STAB-001]: Graceful Shutdown Handling
    const shutdown = async (signal: string) => {
      logger.info('system', `${signal} received. Starting graceful shutdown...`);
      
      // Stop accepting new connections
      server.close(async () => {
        logger.info('system', "HTTP server closed.");
        
        try {
          // Close DB connections
          await closeDb();
          logger.info('system', "Cleanup complete. Exiting.");
          logger.shutdown();
          process.exit(0);
        } catch (err) {
          logger.error('system', "Error during DB cleanup", err);
          logger.shutdown();
          process.exit(1);
        }
      });

      // Force exit after 10s if graceful shutdown fails
      setTimeout(() => {
        logger.critical('system', "Could not close connections in time, forcefully shutting down.");
        logger.shutdown();
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // STABILITY-FIX [STAB-002]: Professional Process Error Handling
    process.on('unhandledRejection', (reason, promise) => {
      logger.critical('error', 'Unhandled Rejection', reason, { promise: String(promise) });
      if (process.env.NODE_ENV === 'development') process.exit(1);
    });

    // A single bad request (e.g. a malformed WebSocket frame or multipart body) must not take the service down
    // for everyone: log and keep serving. Only a burst of uncaught exceptions (something is really broken)
    // ends the process, so the supervisor (docker restart policy / systemd) starts a clean one.
    const recentCrashes: number[] = [];
    process.on('uncaughtException', (error) => {
      logger.critical('error', 'Uncaught Exception', error);
      const now = Date.now();
      recentCrashes.push(now);
      while (recentCrashes.length && now - recentCrashes[0] > 60_000) recentCrashes.shift();
      if (recentCrashes.length >= 10) shutdown('UncaughtException (10 within a minute)');
    });
  } catch (error) {
    logger.critical('system', "Failed to start server", error);
    console.error("FATAL ERROR DURING STARTUP:", error);
    process.exit(1);
  }
})();
 
