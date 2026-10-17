import assert from "node:assert/strict";
import { Client, newUser, expectStatus, RUN_ID } from "../client";

export type TestUser = Awaited<ReturnType<typeof newUser>>;

let seq = 0;

/** A new account per call. Posting has a per-user cooldown, so every post needs its own author. */
export function freshUser(tag = "u"): Promise<TestUser> {
  seq++;
  return newUser(`ct${tag}${seq}`);
}

export async function createPost(user: TestUser, body: Record<string, unknown>): Promise<any> {
  const res = await user.client.post("/api/posts", { category: "discussion", content: `content ${RUN_ID}`, ...body });
  await expectStatus(res, 201);
  return res.json();
}

export type UploadFile = { data: Buffer | string; type: string; name: string; field?: string };

export function postForm(client: Client, fields: Record<string, string>, files: UploadFile[] = []): Promise<Response> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  for (const f of files) form.append(f.field ?? "media", new Blob([f.data], { type: f.type }), f.name);
  return client.request("POST", "/api/posts", { form });
}

export async function createCommunity(admin: Client, name: string, extra: Record<string, unknown> = {}): Promise<any> {
  const res = await admin.post("/api/communities", { name, description: "content e2e", ...extra });
  await expectStatus(res, 201);
  return res.json();
}

export async function invite(admin: Client, communityId: number, userId: number): Promise<void> {
  await expectStatus(await admin.post(`/api/communities/${communityId}/invite`, { userId }), 200);
}

/** 4xx, never 5xx, and no stack trace or SQL in the body. */
export async function assertClientError(res: Response, label = ""): Promise<string> {
  const text = await res.text();
  assert.ok(res.status >= 400 && res.status < 500, `${label} expected 4xx, got ${res.status}: ${text.slice(0, 200)}`);
  assertNoInternals(text, label);
  return text;
}

export function assertNoInternals(text: string, label = ""): void {
  assert.ok(!/Failed query|syntax error|relation "|invalid input syntax|at [\w.<>]+ \(|node_modules/i.test(text), `${label} leaks internals: ${text.slice(0, 200)}`);
}

export async function karmaOf(username: string): Promise<number> {
  const res = await new Client().get(`/api/users/${username}`);
  await expectStatus(res, 200);
  return (await res.json()).karma;
}

/** Detects the real format of a served file from its first bytes. */
export function sniff(buf: Buffer): string {
  const hex = buf.subarray(0, 16).toString("hex");
  if (hex.startsWith("89504e47")) return "image/png";
  if (hex.startsWith("ffd8ff")) return "image/jpeg";
  if (hex.startsWith("47494638")) return "image/gif";
  if (hex.startsWith("52494646") && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (buf.subarray(4, 8).toString() === "ftyp") return "video/mp4";
  if (hex.startsWith("1a45dfa3")) return "video/webm";
  return "unknown";
}

// 1x1 GIF
export const GIF_1X1 = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
// Minimal MP4 header (ftyp box) followed by padding; enough for the signature check.
export const MP4_STUB = Buffer.concat([Buffer.from("00000018667479706d703432000000006d703432", "hex"), Buffer.alloc(64)]);
export const WEBM_STUB = Buffer.concat([Buffer.from("1a45dfa3", "hex"), Buffer.alloc(64)]);
