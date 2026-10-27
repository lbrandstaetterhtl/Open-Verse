import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import themePlugin from "@replit/vite-plugin-shadcn-theme-json";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import fs from "node:fs";

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

// Content hash of all translation files. The client loads /locales/... with ?v=<hash>, so a browser never
// keeps using an old translation file after an update (the files themselves have no hash in their name).
function localesVersion(): string {
  const dir = path.resolve(__dirname, "client", "public", "locales");
  const hash = createHash("sha256");
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else { hash.update(path.relative(dir, p)); hash.update(fs.readFileSync(p)); }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return hash.digest("hex").slice(0, 12);
}

// Staff-only code (admin/owner area) lives in client/src/staff. Every chunk with a module from there is named
// assets/staff-<hash>.js, so the server can refuse those files to everyone but staff (server/staff-assets.ts).
// Rollup groups modules by the entry points that reach them, and public code reaches client/src/staff only
// through one dynamic import (client/src/lib/staff.tsx), so a staff chunk never holds code public pages need.
const STAFF_SRC = path.resolve(__dirname, "client", "src", "staff") + path.sep;
const isStaffModule = (id: string) => path.resolve(id.split("?")[0]).startsWith(STAFF_SRC);

export default defineConfig(({ command }) => ({
  define: {
    __LOCALES_VERSION__: JSON.stringify(localesVersion()),
  },
  plugins: [
    react(),
    themePlugin(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  root: path.resolve(__dirname, "client"),
  // Production bundle: no console.log/debug/info output (console.warn/error stay), no debugger statements,
  // no license banners with library versions (the licenses are in node_modules and package-lock.json).
  esbuild: command === "build"
    ? { pure: ["console.log", "console.debug", "console.info"], drop: ["debugger"], legalComments: "none" }
    : undefined,
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        chunkFileNames: (chunk) =>
          chunk.moduleIds.some(isStaffModule) ? "assets/staff-[hash].js" : "assets/[name]-[hash].js",
        assetFileNames: (asset) =>
          (asset.originalFileNames ?? []).some(isStaffModule) ? "assets/staff-[hash][extname]" : "assets/[name]-[hash][extname]",
      },
    },
  },
  server: {
    hmr: {
      overlay: false
    }
  },
}));
