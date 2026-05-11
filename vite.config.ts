import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import themePlugin from "@replit/vite-plugin-shadcn-theme-json";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

export default defineConfig({
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
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("node_modules")) {
            if (id.includes("react") || id.includes("wouter") || id.includes("scheduler")) {
              return "vendor-react";
            }
            if (id.includes("framer-motion") || id.includes("lucide-react") || id.includes("@radix-ui")) {
              return "vendor-ui";
            }
            if (id.includes("date-fns") || id.includes("axios") || id.includes("i18next") || id.includes("zod")) {
              return "vendor-utils";
            }
            if (id.includes("@tanstack/react-query")) {
              return "vendor-query";
            }
            return "vendor"; // Other libraries
          }
        },
      },
    },
  },
  server: {
    hmr: {
      overlay: false
    }
  },
});
