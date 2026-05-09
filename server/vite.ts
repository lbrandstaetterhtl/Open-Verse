import express, { type Express } from "express";
import fs from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
import { type Server } from "node:http";

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  // Dynamic import — vite is a devDependency, never loaded in production
  // NOTE: Do NOT import ../vite.config here — esbuild would bundle it and
  // its 'import from vite' would become a static top-level import in dist/index.js.
  // Instead, pass configFile as a string path so vite loads it itself at runtime.
  const { createServer: createViteServer, createLogger } = await import("vite");

  const viteLogger = createLogger();
  const port = parseInt(process.env.PORT || "5000");

  const vite = await createViteServer({
    configFile: path.resolve(process.cwd(), "vite.config.ts"),
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: {
      middlewareMode: true,
      hmr: { server, clientPort: port },
      allowedHosts: true as true,
    },
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    if (url.startsWith("/api")) {
      console.log(`[API 404] ${req.method} ${url}`);
      res.status(404).json({ error: `API route not found: ${url}` });
      return;
    }

    try {
      const clientTemplate = path.resolve(__dirname, "..", "client", "index.html");

      // always reload the index.html file from disk in case it changes
      const template = await fs.promises.readFile(clientTemplate, "utf-8");
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath, {
    maxAge: '1y',
    immutable: true,
    index: false
  }));

  // fall through to index.html if the file doesn't exist
  app.use("*", (req, res) => {
    if (req.originalUrl.startsWith("/api")) {
      console.log(`[API 404] ${req.method} ${req.originalUrl}`);
      res.status(404).json({ error: `API route not found: ${req.originalUrl}` });
      return;
    }
    // SEC-FIX: Prevent caching of index.html to ensure clients always get the latest asset hashes
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
