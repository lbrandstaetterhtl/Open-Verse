/**
 * User-supplied links (profile website, ticket related URL) are only rendered as links when they are http(s).
 * Anything else (javascript:, data:, vbscript:, …) is shown as plain text by the caller.
 * Links to other sites always open with rel="noopener noreferrer" (see EXTERNAL_LINK_REL).
 */
export const EXTERNAL_LINK_REL = "noopener noreferrer";

/** The normalized http(s) URL, or null. `assumeHttps` turns a bare "example.com/path" into https://example.com/path. */
export function safeExternalUrl(value: unknown, { assumeHttps = false } = {}): string | null {
  if (typeof value !== "string") return null;
  let v = value.trim();
  if (!v || v.length > 2048) return null;
  // Whitespace, quotes and angle brackets are never part of an address (browsers differ in how they parse them)
  if (/[\s<>"'`\\]/.test(v)) return null;
  if (!/^https?:\/\//i.test(v)) {
    // Something with its own scheme ("javascript:", "mailto:", "data:") is never turned into a link
    if (!assumeHttps || /^[a-z][a-z0-9+.-]*:/i.test(v) || v.startsWith("/")) return null;
    v = `https://${v}`;
  }
  try {
    const url = new URL(v);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // A plain host name (international names arrive punycoded) or an IP address
    if (!/^([a-z0-9-]+\.)*[a-z0-9-]+$|^\[[0-9a-f:.]+\]$/i.test(url.hostname)) return null;
    return url.href;
  } catch {
    return null;
  }
}
