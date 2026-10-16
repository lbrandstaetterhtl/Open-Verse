import i18n from "./i18n";

/**
 * The API answers errors with English text (e.g. "Username already taken"). The "server" namespace maps each
 * of those texts to a key (en/server.json: key -> exact English text), so the client can show the message in
 * the UI language. Unknown texts are shown as they are. tests/i18n checks that every message the server can
 * send has an entry.
 */
let reverse: Map<string, string> | null = null;
let reverseSource: unknown = null;

export function translateServerMessage(text: string): string {
  const english = i18n.getResourceBundle("en", "server") as Record<string, string> | undefined;
  if (!english) return text;
  if (reverseSource !== english) {
    reverse = new Map(Object.entries(english).map(([key, value]) => [value, key]));
    reverseSource = english;
  }
  const key = reverse!.get(text.trim());
  return key ? i18n.t(`server:${key}`, { defaultValue: text }) : text;
}

/** Error thrown for non-2xx API responses: readable, translated message plus the HTTP status. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

/** Builds an ApiError from a response body ({ error } / { message } JSON or plain text). */
export function apiErrorFrom(status: number, statusText: string, body: string): ApiError {
  let text = body.trim();
  let code: string | undefined;
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === "object") {
      code = typeof parsed.code === "string" ? parsed.code : undefined;
      text = String(parsed.error ?? parsed.message ?? text);
    }
  } catch {
    // plain text or an HTML error page from a proxy
  }
  if (!text || text.startsWith("<")) text = statusText || `HTTP ${status}`;
  return new ApiError(translateServerMessage(text), status, code);
}
