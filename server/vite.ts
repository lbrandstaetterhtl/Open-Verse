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
  const { createServer: createViteServer, createLogger } = await import("vite");
  const { default: viteConfig } = await import("../vite.config");

  const viteLogger = createLogger();
  const port = parseInt(process.env.PORT || "5000");
  const serverOptions = {
    middlewareMode: true,
    hmr: { server, clientPort: port },
    allowedHosts: true as true,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
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

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (req, res) => {
    if (req.originalUrl.startsWith("/api")) {
      console.log(`[API 404] ${req.method} ${req.originalUrl}`);
      res.status(404).json({ error: `API route not found: ${req.originalUrl}` });
      return;
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
