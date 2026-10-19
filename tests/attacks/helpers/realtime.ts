// Shared helpers for the REALTIME attack scenarios (tests/attacks/realtime.attack.test.ts).
// Covers the WebSocket endpoint at /ws (auth, origin, framing, broadcast fan-out), availability
// probes, and a safe server-restart used after a scenario that may take the process down.
// See the attack brief: a crash during an attack is itself a finding; we restart so the rest of
// the suite can run and the box is left healthy.
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { BASE_URL, Client, newUser } from "../../e2e/client";

// ws is a production dependency of the app; load it from the app's own node_modules.
const require = createRequire("/home/user/Open-Verse/");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const WebSocket = require("ws");

export { Client, newUser, BASE_URL };

export const WS_HOST = BASE_URL.replace(/^https?:\/\//, "");
export const WS_URL = BASE_URL.replace(/^http/, "ws") + "/ws";

const PORT = (() => {
  const m = BASE_URL.match(/:(\d+)/);
  return m ? m[1] : "5086";
})();
const DB = process.env.E2E_DB ?? "ovatk_realtime";
const RUN_DEV = "/tmp/claude-0/-home-user-Open-Verse/e504c76b-dbc8-5619-9e7c-0e4053e6add3/scratchpad/audit/run-dev.sh";

/** The session cookie header for a logged-in Client (Map -> "k=v; k2=v2"). */
export function cookieHeader(client: Client): string {
  return [...client.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
}

export type WsResult =
  | { ok: true; ws: any }
  | { ok: false; status?: number; err?: string };

/** Open a WebSocket to /ws with explicit headers; resolve with the outcome (never throws). */
export function openWs(headers: Record<string, string>, timeoutMs = 4000): Promise<WsResult> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r: WsResult) => { if (!done) { done = true; resolve(r); } };
    const ws = new WebSocket(WS_URL, { headers });
    ws.on("open", () => finish({ ok: true, ws }));
    ws.on("unexpected-response", (_req: any, res: any) => finish({ ok: false, status: res.statusCode }));
    ws.on("error", (e: any) => finish({ ok: false, err: String(e?.message ?? e) }));
    setTimeout(() => finish({ ok: false, err: "timeout" }), timeoutMs);
  });
}

/** Open an authenticated WebSocket for a logged-in client with a same-origin Origin header. */
export function openWsAuthed(client: Client): Promise<WsResult> {
  return openWs({ cookie: cookieHeader(client), origin: `http://${WS_HOST}` });
}

/** Collect messages that arrive on a socket; returns a getter for the accumulated strings. */
export function collect(ws: any): () => string[] {
  const msgs: string[] = [];
  ws.on("message", (d: any) => msgs.push(d.toString()));
  return () => msgs.slice();
}

/** Is the server process answering /api/health? */
export async function serverUp(timeoutMs = 2000): Promise<boolean> {
  try {
    const res = await fetch(BASE_URL + "/api/health", { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Wait until the server is up (or time out). Used after a restart. */
export async function waitForUp(deadlineMs = 60000): Promise<boolean> {
  const end = Date.now() + deadlineMs;
  while (Date.now() < end) {
    if (await serverUp()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/** Restart the audit server via run-dev.sh and wait for it to come back up. */
export async function restartServer(): Promise<void> {
  await new Promise<void>((resolve) => {
    execFile("bash", [RUN_DEV, PORT, DB], { timeout: 90000 }, () => resolve());
  });
  await waitForUp();
}

/**
 * Build a single masked WebSocket data frame with an arbitrary opcode. Opcodes 3-7 and B-F are
 * reserved; a server receiver rejects them as a protocol error. Payload is masked as the protocol
 * requires for client->server frames, so the only violation is the opcode itself.
 */
export function maskedFrame(opcode: number, payload: Buffer = Buffer.alloc(0)): Buffer {
  const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]);
  const masked = Buffer.from(payload);
  for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i & 3];
  const len = masked.length;
  if (len > 125) throw new Error("helper only builds short frames");
  return Buffer.concat([Buffer.from([0x80 | (opcode & 0x0f), 0x80 | len]), mask, masked]);
}

/** Write raw bytes onto a live WebSocket's underlying socket (bypassing ws framing). */
export function rawWrite(ws: any, bytes: Buffer): void {
  ws._socket.write(bytes);
}
