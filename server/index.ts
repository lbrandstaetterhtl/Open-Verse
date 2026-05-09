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
import { requestLoggerMiddleware } from "./middleware/request-logger";
import { globalErrorHandler } from "./middleware/error-handler";
import { dbLogger } from "./logger/service-loggers";


const app = express();

// SECURITY-FIX [SEC-001]: Global Security Headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Vite/Dev need inline
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false, // Required for some media loads
}));

// SECURITY-FIX [SEC-005]: Explicit CORS Policy
app.use(cors({
  origin: true, // Allow all origins in dev, or specific origins in prod
  credentials: true,
}));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

// PRODUCTION SECURITY [SEC-001]: Enable trust proxy if the application is behind a reverse proxy (Nginx, etc.)
// This ensures that req.ip and secure cookies work correctly.
if (process.env.TRUST_PROXY === "true" || process.env.TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
} else if (process.env.TRUST_PROXY && process.env.TRUST_PROXY !== "false") {
  app.set("trust proxy", process.env.TRUST_PROXY);
}

// Ensure uploads directory exists and set proper permissions
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  logger.info('system', "Created uploads directory", { path: uploadsDir });
}

// SEC-005: Hardened Static Serving for Uploads
app.use(
  "/uploads",
  (req, res, next) => {
    // Set restrictive security headers for uploaded content
    res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline';");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    next();
  },
  express.static(uploadsDir, {
    index: false,
    redirect: false,
    dotfiles: 'ignore'
  }),
);


// DOCKER [HEALTH-001]: Health check endpoint for Docker/load-balancer probes
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
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
    
    // MIGRATION [POSTGRES-FIX]: Ensure schema consistency
    // This MUST run before any other DB operations
    const { ensurePostgresColumns } = await import("./migrations/ensure_postgres_columns");
    await ensurePostgresColumns();

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

    if (app.get("env") === "development") {
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

    process.on('uncaughtException', (error) => {
      logger.critical('error', 'Uncaught Exception', error);
      shutdown('UncaughtException');
    });
  } catch (error) {
    logger.critical('system', "Failed to start server", error);
    console.error("FATAL ERROR DURING STARTUP:", error);
    process.exit(1);
  }
})();
 
