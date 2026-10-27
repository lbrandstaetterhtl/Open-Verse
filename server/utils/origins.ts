import type { IncomingMessage } from "node:http";

/**
 * Which browser origins may talk to the API with the user's cookies (CORS with credentials, WebSocket
 * upgrades): the app's own origin (same host as the request) plus the origins listed in CORS_ORIGINS
 * (comma-separated, e.g. "https://app.example.com,https://admin.example.com"). "null" (sandboxed frames,
 * file:// pages) is never allowed.
 */
const extraOrigins = new Set(
  (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, "").toLowerCase())
    .filter(Boolean),
);

export function isAllowedOrigin(origin: string | undefined, req: IncomingMessage): boolean {
  if (!origin || origin === "null") return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (extraOrigins.has(url.origin.toLowerCase())) return true;
  const host = req.headers.host;
  return !!host && url.host.toLowerCase() === host.toLowerCase();
}
