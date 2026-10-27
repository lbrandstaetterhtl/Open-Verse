import net from "node:net";

/**
 * Helpers for what admin screens may show about people: masked IP addresses (the network, not the
 * device), no email addresses in free text, short user agents.
 */

/** 203.0.113.7 → "203.0.113.x"; 2001:db8:1:2::5 → "2001:db8:1::/48"; IPv4-mapped IPv6 like IPv4. */
export function maskIp(ip: unknown): string | null {
  if (typeof ip !== "string" || !ip) return null;
  let v = ip.trim();
  if (v.toLowerCase().startsWith("::ffff:") && net.isIPv4(v.slice(7))) v = v.slice(7);
  if (net.isIPv4(v)) return v.split(".").slice(0, 3).join(".") + ".x";
  if (net.isIPv6(v)) {
    if (v === "::1") return "::1";
    const [head] = v.split("::");
    const groups = head ? head.split(":") : [];
    while (groups.length < 3) groups.push("0");
    return `${groups.slice(0, 3).join(":")}::/48`;
  }
  return "unknown";
}

const IPV4_IN_TEXT = /\b(?:::ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}\b/gi;
const IPV6_IN_TEXT = /\b(?:[0-9a-f]{1,4}:){2,7}[0-9a-f:]{0,4}\b/gi;
const EMAIL_IN_TEXT = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** Masks IP addresses inside free text (descriptions like "5 failed attempts. IP: 203.0.113.7"). */
export function maskIpsInText(text: unknown): string {
  if (typeof text !== "string") return text as any;
  return text
    .replace(IPV4_IN_TEXT, (_m, net24) => `${net24}.x`)
    .replace(IPV6_IN_TEXT, (m) => (net.isIPv6(m) ? maskIp(m) ?? m : m));
}

/** Replaces email addresses inside free text with "[email]". */
export function redactEmails(text: unknown): string {
  if (typeof text !== "string") return text as any;
  return text.replace(EMAIL_IN_TEXT, "[email]");
}

/** Text shown on an admin screen: no email addresses, masked IPs. */
export function redactText(text: unknown): any {
  if (typeof text !== "string") return text;
  return maskIpsInText(redactEmails(text));
}

/** At most `max` characters of a User-Agent header (anything longer is noise or an attack on the logs). */
export function truncateUserAgent(ua: unknown, max = 300): string | undefined {
  if (typeof ua !== "string" || !ua) return undefined;
  return ua.length > max ? ua.slice(0, max) : ua;
}

/** JSON text (metadata / old / new values): parsed, emails and IPs redacted, serialised again. */
export function redactJsonText(value: unknown): any {
  if (typeof value !== "string" || !value) return value;
  try {
    return JSON.stringify(redactDeep(JSON.parse(value)));
  } catch {
    return redactText(value);
  }
}

const SECRET_KEYS = /^(password|passwordHash|token|csrfToken|secret|email|userEmail|ipAddress|ip|userAgent|deviceFingerprint|sessionId)$/i;

function redactDeep(v: any, depth = 0): any {
  if (depth > 6) return undefined;
  if (typeof v === "string") return redactText(v);
  if (Array.isArray(v)) return v.map((x) => redactDeep(x, depth + 1));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if (SECRET_KEYS.test(k)) {
        if (/^(ip|ipAddress)$/i.test(k)) out[k] = maskIp(val);
        continue;
      }
      out[k] = redactDeep(val, depth + 1);
    }
    return out;
  }
  return v;
}

/**
 * An activity_logs row as the admin log screens get it: only the displayed columns, masked IP, no full user
 * agent, no email (also not inside descriptions / metadata), no always-empty session/fingerprint columns.
 */
export function toAdminLogRow(row: any) {
  if (!row) return row;
  return {
    id: row.id,
    userId: row.userId,
    userRole: row.userRole,
    userUsername: row.userUsername,
    action: row.action,
    category: row.category,
    subcategory: row.subcategory,
    targetType: row.targetType,
    targetId: row.targetId,
    targetLabel: redactText(row.targetLabel),
    description: redactText(row.description),
    metadata: redactJsonText(row.metadata),
    oldValue: redactJsonText(row.oldValue),
    newValue: redactJsonText(row.newValue),
    ipAddress: maskIp(row.ipAddress),
    ipCountry: row.ipCountry,
    deviceType: row.deviceType,
    deviceOs: row.deviceOs,
    deviceBrowser: row.deviceBrowser,
    status: row.status,
    severity: row.severity,
    isAnomaly: row.isAnomaly,
    anomalyType: row.anomalyType,
    anomalyScore: row.anomalyScore,
    createdAt: row.createdAt,
  };
}
