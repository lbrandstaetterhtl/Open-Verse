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


const app = express();

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
  console.log("Created uploads directory:", uploadsDir);
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


// Add request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Validate required environment variables
const useSqlite = process.env.USE_SQLITE === "true";
const requiredEnvVars = useSqlite
  ? ["SESSION_SECRET"] // SQLite doesn't need DATABASE_URL
  : ["SESSION_SECRET", "DATABASE_URL"]; // Neon needs DATABASE_URL

const missingEnvVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error("Missing required environment variables:", missingEnvVars.join(", "));
  process.exit(1);
}

// Check optional SendGrid configuration
if (!process.env.SENDGRID_API_KEY) {
  console.warn("SENDGRID_API_KEY not configured - email verification will be skipped");
} else if (!process.env.SENDGRID_API_KEY.startsWith("SG.")) {
  console.warn("SENDGRID_API_KEY is invalid - email verification will be skipped");
}

// Register routes
(async () => {
  try {
    console.log("Starting server...");
    
    // FEATURE [AS-009]: Initialize system settings
    await SettingsService.seed();
    
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
      console.log("[Analytics] No snapshots found, bootstrapping last 7 days...");
      for (let i = 7; i >= 1; i--) {
        try {
          await analyticsService.computeDailySnapshot(subDays(new Date(), i));
        } catch (e) {
          console.error(`[Analytics] Failed bootstrap for -${i} days:`, e);
        }
      }
    }
    
    // MODERATOR PERFORMANCE: Initial bootstrap
    console.log("[ModPerf] Bootstrapping initial performance snapshots...");
    for (let i = 7; i >= 0; i--) {
      try {
        await moderatorPerformanceService.computeDailySnapshot(
          subDays(new Date(), i).toISOString().slice(0, 10)
        );
      } catch (e) {
        console.error(`[ModPerf] Bootstrap for -${i} days failed:`, e);
      }
    }

    // ANALYTICS: Schedule daily snapshot at 00:05
    setInterval(async () => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 5) {
        console.log("[Analytics] Running scheduled daily snapshot...");
        try {
          await analyticsService.computeDailySnapshot(subDays(new Date(), 1));
          await moderatorPerformanceService.computeDailySnapshot(
            subDays(new Date(), 1).toISOString().slice(0, 10)
          );
        } catch (e) {
          console.error("[Analytics] Scheduled snapshot failed:", e);
        }
      }
    }, 60 * 1000); // Check every minute
    
    const server = await registerRoutes(app);

    // Global error handler - MOVED HERE [INDEX-001] to catch route errors correctly
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      console.error("Unhandled error:", err);
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
    });

    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    const port = parseInt(process.env.PORT || "5000");
    const host = process.env.HOST || "0.0.0.0";
    
    server.listen(port, host, () => {
      console.log(`Server started successfully on ${host}:${port} (${app.get("env")} mode)`);
    });

    // Handle server errors
    server.on("error", (error: any) => {
      console.error("Server error:", error);
      process.exit(1);
    });

    // STABILITY-FIX [STAB-001]: Graceful Shutdown Handling
    const shutdown = async (signal: string) => {
      console.log(`\n${signal} received. Starting graceful shutdown...`);
      
      // Stop accepting new connections
      server.close(async () => {
        console.log("HTTP server closed.");
        
        try {
          // Close DB connections
          await closeDb();
          console.log("Cleanup complete. Exiting.");
          process.exit(0);
        } catch (err) {
          console.error("Error during DB cleanup:", err);
          process.exit(1);
        }
      });

      // Force exit after 10s if graceful shutdown fails
      setTimeout(() => {
        console.error("Could not close connections in time, forcefully shutting down.");
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // STABILITY-FIX [STAB-002]: Unhandled Rejections & Exceptions
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      // Optional: Send to external monitoring service
    });

    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      // Graceful shutdown after uncaught exception
      shutdown('UncaughtException');
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
})();
