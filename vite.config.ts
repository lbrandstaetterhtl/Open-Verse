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

export default defineConfig({
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
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    hmr: {
      overlay: false
    }
  },
});
