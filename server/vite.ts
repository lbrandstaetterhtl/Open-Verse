import express, { type Express } from "express";
import fs from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
import { type Server } from "node:http";
import { isStaffAssetPath, sendStaticNotFound, STAFF_ASSET_ALLOWED } from "./staff-assets";

// App routes whose last segment is a user-chosen name that may contain a dot (usernames allow ".").
const NAMED_APP_ROUTE = /^\/(users|c)\/[^/]+\/?$/;

/**
 * Requests that are after a file, not an app page: dotfiles (/.env, /.git/config), anything under the static
 * folders, and paths with a file extension (/something.php, /manifest.json). They get a real 404 instead of the
 * SPA's index.html; only extension-less app routes fall back to index.html.
 */
export function isFileRequest(urlPath: string): boolean {
  let p: string;
  try {
    p = decodeURIComponent(urlPath);
  } catch {
    return true;
  }
  if (p.split("/").some((segment) => segment.startsWith("."))) return true;
  if (/^\/(assets|locales|fonts|uploads|src|@[\w-]+)\//i.test(p)) return true;
  if (NAMED_APP_ROUTE.test(p)) return false;
  return /\.[a-z0-9]{1,10}$/i.test(p);
}

const pathnameOf = (originalUrl: string) => originalUrl.split("?")[0].split("#")[0];

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
      res.status(404).json({ error: "API route not found", code: "API_NOT_FOUND" });
      return;
    }

    if (isFileRequest(pathnameOf(url))) {
      sendStaticNotFound(res);
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

  const staticFiles = express.static(distPath, {
    index: false,
    setHeaders: (res, filePath) => {
      const rel = path.relative(distPath, filePath).split(path.sep).join("/");
      const staff = isStaffAssetPath(`/${rel}`);
      if (staff) res.setHeader("Vary", "Cookie");
      if (rel.startsWith("assets/")) {
        // Vite puts a content hash into these file names: safe to cache forever. Staff chunks only in the
        // browser of the staff member (private), never in a shared cache.
        res.setHeader("Cache-Control", `${staff ? "private" : "public"}, max-age=31536000, immutable`);
      } else if (rel.startsWith("locales/")) {
        // Translations keep their names; the browser must revalidate (ETag) so updates show up at once
        res.setHeader("Cache-Control", staff ? "private, no-cache" : "no-cache");
      } else {
        res.setHeader("Cache-Control", "public, max-age=3600");
      }
    },
  });

  // Staff-only files (assets/staff-*, staff locale namespaces) are served only after staffAssetGuard
  // (server/staff-assets.ts) has checked the session; without it they answer like a missing file.
  app.use((req, res, next) => {
    if (isStaffAssetPath(req.path) && res.locals[STAFF_ASSET_ALLOWED] !== true) {
      sendStaticNotFound(res);
      return;
    }
    staticFiles(req, res, next);
  });

  // fall through to index.html if the file doesn't exist
  app.use("*", (req, res) => {
    if (req.originalUrl.startsWith("/api")) {
      console.log(`[API 404] ${req.method} ${req.originalUrl}`);
      res.status(404).json({ error: "API route not found", code: "API_NOT_FOUND" });
      return;
    }
    // Unknown files (/assets/nope.js, /.env, /x.php): a real 404, not the app's HTML
    if (isFileRequest(pathnameOf(req.originalUrl))) {
      sendStaticNotFound(res);
      return;
    }
    // SEC-FIX: Prevent caching of index.html to ensure clients always get the latest asset hashes
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
