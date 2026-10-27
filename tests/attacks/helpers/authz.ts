// Shared setup helpers for the AUTHZ attack scenarios (tests/attacks/authz.attack.test.ts).
// These wrap the e2e Client so a scenario can mint privileged accounts, communities and content
// without repeating the owner-driven boilerplate. The owner account is the platform owner passed
// via E2E_ADMIN_USER / E2E_ADMIN_PASSWORD (see the attack brief).
import { Client, newUser, expectStatus, RUN_ID } from "../../e2e/client";

export { Client, newUser, expectStatus, RUN_ID };

export type Actor = {
  client: Client;
  username: string;
  password: string;
  id: number;
};

/** All group permissions the admin UI offers (client/src/components/admin/GroupsManagement.tsx). */
export const ALL_PERMISSIONS = [
  "dashboard", "users", "reports", "groups", "security", "auto_punishment",
  "logs", "analytics", "performance", "tickets", "stress_test", "settings",
] as const;

/** Create an admin group owned/created by `owner` with the given permissions; returns its id. */
export async function createGroup(owner: Client, name: string, permissions: readonly string[]): Promise<number> {
  const res = await owner.post("/api/admin/groups", {
    name: `atk_${RUN_ID}_${name}`,
    description: "authz attack scenario",
    permissions: JSON.stringify([...permissions]),
  });
  await expectStatus(res, 201);
  return (await res.json()).id as number;
}

/** Promote a freshly-registered actor to role admin, optionally placing them in `groupId`. */
export async function promoteToAdmin(owner: Client, actor: Actor, groupId: number | null): Promise<void> {
  await expectStatus(await owner.patch(`/api/admin/users/${actor.id}`, { role: "admin" }), 200);
  if (groupId !== null) {
    await expectStatus(await owner.post("/api/admin/groups/assign", { userId: actor.id, groupId }), 200);
  }
  // Re-login so the actor's session carries the new role/group.
  await expectStatus(await actor.client.login(actor.username, actor.password), 200);
}

/** Promote an actor to platform owner (needs an existing owner to perform it). */
export async function promoteToOwner(owner: Client, actor: Actor): Promise<void> {
  await expectStatus(await owner.patch(`/api/admin/users/${actor.id}`, { role: "owner" }), 200);
  await expectStatus(await actor.client.login(actor.username, actor.password), 200);
}

/** The owner's own view of a user row (adminGroupId, role, karma, ...) for assertions. */
export async function adminUserView(owner: Client, id: number): Promise<any> {
  const list = await (await owner.get("/api/admin/users")).json();
  return list.find((u: any) => u.id === id);
}

/** Create a community (owned by `creator`, who must be allowed to create one) and return it. */
export async function createCommunity(creator: Client, name: string, isPrivate: boolean): Promise<any> {
  const res = await creator.post("/api/communities", {
    name: `${name} ${RUN_ID}`,
    description: "authz attack scenario",
    isPrivate,
    allowedCategories: "general",
  });
  await expectStatus(res, 201);
  return res.json();
}

/** Create a post (optionally inside a community) and return it. */
export async function createPost(author: Client, content: string, communityId?: number): Promise<any> {
  const body: Record<string, unknown> = { content, category: "general" };
  if (communityId) body.communityId = String(communityId);
  const res = await author.post("/api/posts", body);
  await expectStatus(res, 201);
  return res.json();
}

/** Create a support ticket for `author` and return { ticket, comments, history }. */
export async function createTicket(author: Client, title: string): Promise<any> {
  const res = await author.post("/api/tickets", {
    title,
    description: "authz attack scenario ".repeat(4),
    type: "other",
    priority: "low",
  });
  await expectStatus(res, 201);
  return res.json();
}
