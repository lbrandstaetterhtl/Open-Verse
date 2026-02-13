import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import fs from "fs";
import path from "path";


const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

// Ensure uploads directory exists and set proper permissions
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log("Created uploads directory:", uploadsDir);
}

// Log static file requests for debugging
app.use(
  "/uploads",
  (req, res, next) => {
    console.log("Static file request:", req.url);
    next();
  },
  express.static(uploadsDir),
);

// Add request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

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

// Global error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err);
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
});

(async () => {
  try {
    console.log("Starting server...");
    const server = await registerRoutes(app);

    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    const port = parseInt(process.env.PORT || "5000");
    server.listen(port, "127.0.0.1", () => {
      console.log(`Server started successfully on port ${port}`);
    });

    // Handle server errors
    server.on("error", (error: any) => {
      console.error("Server error:", error);
      process.exit(1);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
})();
