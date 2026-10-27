// Helpers for the server-side input-handling attack suite (tests/attacks/inject.attack.test.ts).
// They build on the audit-1 input helpers (send/problem/withIp) and add the raw-socket and
// query-string tools the structural attacks need.
import net from "node:net";
import { BASE_URL, Client, freshIp } from "../../e2e/client";

export { send, problem, withIp, type Sent, type Payload } from "../../e2e/helpers/input";

/** A logged-in client on a fresh IP, so a long battery never trips the per-IP API limit. */
export async function fresh(cookies: Client): Promise<Client> {
  const copy = new Client(freshIp());
  for (const [k, v] of cookies.cookies) copy.cookies.set(k, v);
  copy.csrfToken = cookies.csrfToken;
  return copy;
}

/** Host:port of the server under test, parsed from E2E_BASE_URL. */
function target(): { host: string; port: number } {
  const u = new URL(BASE_URL);
  return { host: u.hostname, port: Number(u.port || 80) };
}

/**
 * Sends a verbatim HTTP/1.1 request over a raw socket (bypassing fetch's header validation) so we
 * can push control characters, NUL bytes and oversize headers at the server. Returns the status
 * line and whether the socket stayed usable. Used for the header-injection scenarios.
 */
export function rawRequest(requestLine: string, extraHeaders: string[] = [], timeoutMs = 8000): Promise<{ statusLine: string; raw: string; error?: string }> {
  const { host, port } = target();
  return new Promise((resolve) => {
    const socket = net.connect(port, host, () => {
      const head = [requestLine, `Host: ${host}:${port}`, ...extraHeaders, "Connection: close", "", ""].join("\r\n");
      socket.write(head);
    });
    let data = "";
    const done = (error?: string) => resolve({ statusLine: data.split("\r\n")[0] ?? "", raw: data, error });
    socket.setTimeout(timeoutMs, () => { socket.destroy(); done("timeout"); });
    socket.on("data", (c) => (data += c.toString("latin1")));
    socket.on("end", () => done());
    socket.on("error", (e) => done(e.message));
  });
}

/** Builds a query string with `depth` nested keys: name[a][a]...[a]=1 (turns a scalar into an object). */
export function deepKey(name: string, depth: number, value = "1"): string {
  return `${name}${"[a]".repeat(depth)}=${value}`;
}

/** A query string with `count` distinct parameters. */
export function manyParams(count: number): string {
  const parts: string[] = [];
  for (let i = 0; i < count; i++) parts.push(`p${i}=${i}`);
  return parts.join("&");
}

/** Integer-boundary and type-confused values for a path/route id segment. */
export const ID_SEGMENTS = [
  "0", "-1", "1.5", "abc", "1e3", "0x10", "NaN", "Infinity",
  "2147483648", "9999999999", "99999999999999999999", "-2147483649",
  "%00", "a%00b", "..%2f..%2fetc%2fpasswd", "%2e%2e", "__proto__", "constructor",
];

/** Values that are not a plain string, for query parameters the handler treats as a string. */
export const QUERY_SHAPES = (p: string) => [
  `${p}[]=a`, `${p}[]=a&${p}[]=b`, `${p}[a]=b`, `${p}[$gt]=`, `${p}[$ne]=x`,
  `${p}=1&${p}=2`, `${p}[__proto__][isAdmin]=1`,
];

// Pathological search patterns: many LIKE wildcards / anchors that a naive matcher backtracks on.
export const LIKE_BOMBS = [
  "%" + "a%".repeat(2000),
  "_".repeat(3000) + "%",
  "%_".repeat(2000),
  "%".repeat(5000),
  "(" .repeat(3000) + "a" + ")".repeat(3000),
];

// Unicode tricks that a byte/substring profanity filter does not normalise away.
export const PROFANITY_EVASIONS = [
  "s​e​x",        // zero-width spaces between letters
  "ｓｅｘ",     // fullwidth s e x
  "ѕex",               // Cyrillic small letter dze homoglyph for 's'
  "sеx",               // Cyrillic 'e'
];
