// Admin, tickets, themes, AI and monitoring. Everything here runs against the shared server and only
// touches users, groups, rules, bans, reports, tickets and themes this file creates (see helpers/admin.ts).
// Tests that ban IPs/devices, delete files or need global settings live in admin.isolated.test.ts and
// admin.global.test.ts and are not run against the shared server.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client, RUN_ID, PNG_1X1, expectStatus, uploadProfileImage } from "./client";
import {
  Cleanup, ownerSession, uniqueUser, makeAdmin, makeOwner, createGroup, getUserRow, parseCsv, LEAK_PATTERN,
  type TestUser,
} from "./helpers/admin";

const cleanup = new Cleanup();
let owner: Client;
let ownerId: number;

const DESC = "This is an end-to-end ticket description that is comfortably longer than fifty characters.";
const ticketBody = (extra: Record<string, unknown> = {}) => ({
  title: `E2E admin ticket ${RUN_ID}`,
  description: DESC,
  type: "bug_report",
  priority: "low",
  ...extra,
});
const colors = (extra: Record<string, unknown> = {}) => JSON.stringify({ primary: "220 90% 56%", background: "0 0% 100%", ...extra });

async function noLeak(res: Response) {
  const text = await res.text();
  assert.ok(!LEAK_PATTERN.test(text), `response leaks internals: ${text.slice(0, 200)}`);
  return text;
}

before(async () => {
  owner = await ownerSession();
  ownerId = (await (await owner.get("/api/user")).json()).id;
});

after(async () => {
  await cleanup.run(await ownerSession());
});

// ---------------------------------------------------------------------------------------------
describe("admin user management", () => {
  let target: TestUser;
  before(async () => {
    target = await uniqueUser("amu");
    cleanup.users.add(target.id);
  });

  test("owner can toggle verified, emailVerified, shadowban, freeze, karma and profile fields", async () => {
    const res = await owner.patch(`/api/admin/users/${target.id}`, {
      verified: true, emailVerified: 1, isShadowBanned: 1, isFrozen: 0, karma: 42, bio: "set by admin", displayName: "Admin Set",
    });
    await expectStatus(res, 200);
    const body = await res.json();
    assert.equal(body.password, undefined);
    assert.equal(body.verified, 1);
    assert.equal(body.isShadowBanned, 1);
    assert.equal(body.karma, 42);
    assert.equal(body.bio, "set by admin");
    await expectStatus(await owner.patch(`/api/admin/users/${target.id}`, { isShadowBanned: 0, karma: 0, verified: 0 }), 200);
  });

  test("user list shows every user without password hashes", async () => {
    const res = await owner.get("/api/admin/users");
    await expectStatus(res, 200);
    const list = await res.json();
    const row = list.find((u: any) => u.id === target.id);
    assert.ok(row, "created user is listed");
    assert.equal(row.password, undefined);
    assert.ok(!JSON.stringify(list).includes("$2b$"));
  });

  test("empty body, invalid id and unknown user are rejected cleanly", async () => {
    assert.equal((await owner.patch(`/api/admin/users/${target.id}`, {})).status, 400);
    assert.equal((await owner.patch("/api/admin/users/abc", { verified: 1 })).status, 400);
    assert.equal((await owner.patch("/api/admin/users/999999999", { verified: 1 })).status, 404);
    assert.equal((await owner.patch(`/api/admin/users/${target.id}`, { karma: "abc" })).status, 400);
    assert.equal((await owner.patch(`/api/admin/users/${target.id}`, { isFrozen: "yes" })).status, 400);
  });

  test("password and id cannot be changed through the admin endpoint", async () => {
    const res = await owner.patch(`/api/admin/users/${target.id}`, { password: "H