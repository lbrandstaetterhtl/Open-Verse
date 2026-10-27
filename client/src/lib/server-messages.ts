import i18n from "./i18n";

/**
 * The API answers errors with English text (e.g. "Username already taken"). The "server" namespace maps each
 * of those texts to a key (en/server.json: key -> exact English text), so the client can show the message in
 * the UI language. Unknown texts are shown as they are. tests/i18n checks that every message the server can
 * send has an entry.
 */
let reverse: Map<string, string> | null = null;
let reverseSource: unknown = null;

let staffReverse: Map<string, string> | null = null;
let staffReverseSource: unknown = null;

const reverseMap = (bundle: Record<string, unknown>) =>
  new Map(Object.entries(bundle).filter(([, v]) => typeof v === "string").map(([key, value]) => [value as string, key]));

export function translateServerMessage(text: string): string {
  const english = i18n.getResourceBundle("en", "server") as Record<string, string> | undefined;
  if (!english) return text;
  if (reverseSource !== english) {
    reverse = reverseMap(english);
    reverseSource = english;
  }
  const key = reverse!.get(text.trim());
  if (key) return i18n.t(`server:${key}`, { defaultValue: text });
  // Texts only the admin API sends: "staffServer" namespace, loaded for staff only (lib/staff.tsx)
  const staffEnglish = i18n.getResourceBundle("en", "staffServer") as Record<string, string> | undefined;
  if (!staffEnglish) return text;
  if (staffReverseSource !== staffEnglish) {
    staffReverse = reverseMap(staffEnglish);
    staffReverseSource = staffEnglish;
  }
  const staffKey = staffReverse!.get(text.trim());
  return staffKey ? i18n.t(`staffServer:${staffKey}`, { defaultValue: text }) : text;
}

/** Error thrown for non-2xx API responses: readable, translated message plus the HTTP status. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

type Issue = { path?: string; code?: string; minimum?: number; maximum?: number; type?: string; validation?: string; message?: string };

/** One sentence per zod issue from a VALIDATION_ERROR response, e.g. "Username must be at least 3 characters long". */
function validationMessage(issues: Issue[]): string {
  const sentences = issues.slice(0, 3).map((i) => {
    const path = i.path || "_root";
    const leaf = path.split(".").pop()!;
    const field = i18n.t(`server:fields.${leaf}`, { defaultValue: leaf });
    let key = "invalid";
    if (i.code === "invalid_type") key = i.message === "Required" ? "required" : "invalid_type";
    else if (i.code === "too_small") key = i.type === "string" ? (i.minimum === 1 ? "required" : "too_short") : i.type === "array" ? "too_few_items" : "too_small_number";
    else if (i.code === "too_big") key = i.type === "string" ? "too_long" : i.type === "array" ? "too_many_items" : "too_big_number";
    else if (i.code === "invalid_string") key = i.validation === "email" ? "invalid_email" : i.validation === "url" ? "invalid_url" : "invalid_format";
    else if (i.code === "invalid_enum_value" || i.code === "invalid_literal" || i.code === "invalid_union") key = "invalid_option";
    // A custom text from the schema (regex/refine message) is more precise than the generic sentence
    if (i.message && key === "invalid_format" && i.message !== "Invalid") {
      const custom = translateServerMessage(i.message);
      if (custom !== i.message || !/^Invalid/.test(i.message)) return `${field}: ${custom}`;
    }
    return i18n.t(`server:validation.${key}`, { field, min: i.minimum, max: i.maximum });
  });
  return sentences.join("\n");
}

/** Builds an ApiError from a response body ({ error, code?, params?, issues? } JSON or plain text). */
export function apiErrorFrom(status: number, statusText: string, body: string): ApiError {
  let text = body.trim();
  let code: string | undefined;
  let params: Record<string, unknown> | undefined;
  let issues: Issue[] | undefined;
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === "object") {
      code = typeof parsed.code === "string" ? parsed.code : undefined;
      params = parsed.params && typeof parsed.params === "object" ? parsed.params : undefined;
      // VALIDATION_ERROR sends issues; older endpoints may still send a raw ZodError ({ issues, name })
      issues = Array.isArray(parsed.issues) ? parsed.issues : undefined;
      text = String(parsed.error ?? parsed.message ?? (issues ? "Invalid input" : text));
    }
  } catch {
    // plain text or an HTML error page from a proxy
  }
  if (!text || text.startsWith("<")) text = statusText || `HTTP ${status}`;
  if (issues?.length) return new ApiError(validationMessage(issues), status, code ?? "VALIDATION_ERROR");
  if (code && i18n.exists(`server:codes.${code}`)) {
    return new ApiError(i18n.t(`server:codes.${code}`, { ...params, defaultValue: translateServerMessage(text) }), status, code);
  }
  return new ApiError(translateServerMessage(text), status, code);
}
