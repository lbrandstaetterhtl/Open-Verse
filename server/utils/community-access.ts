import type { Request } from "express";
import { storage } from "../storage";
import { connections, broadcastMessage, sendToUser } from "../services/websocket";

export const isStaff = (user: any) => !!user && (user.role === "owner" || user.role === "admin");

/**
 * Who may see content of a community: everyone for public ones; for private ones only members and site staff.
 * `communityId` null/undefined means "not in a community" → visible.
 */
export async function canViewCommunity(user: any, communityId: number | null | undefined): Promise<boolean> {
  if (!communityId) return true;
  const community = await storage.getCommunity(communityId);
  if (!community) return false;
  if (!community.isPrivate) return true;
  if (!user) return false;
  if (isStaff(user)) return true;
  return !!(await storage.getCommunityMember(communityId, user.id));
}

/** Who may post, comment or react in a community: members that are not banned (site staff always). */
export async function canParticipateInCommunity(user: any, communityId: number | null | undefined): Promise<boolean> {
  if (!communityId) return true;
  if (!user) return false;
  const community = await storage.getCommunity(communityId);
  if (!community) return false;
  if (isStaff(user)) return true;
  if (await storage.isUserBannedFromCommunity(communityId, user.id)) return false;
  return !!(await storage.getCommunityMember(communityId, user.id));
}

/** Ids of private communities the user may not see — for filtering lists. */
export async function hiddenCommunityIds(user: any): Promise<Set<number>> {
  if (isStaff(user)) return new Set();
  const memberOf = new Set<number>(user ? (await storage.getUserCommunities(user.id)).map((c: any) => c.id) : []);
  const hidden = new Set<number>();
  // Page through all communities (getCommunities is paginated)
  for (let offset = 0; ; offset += 500) {
    const page = (await storage.getCommunities({ limit: 500, offset })) as any[];
    for (const c of page) if (c.isPrivate && !memberOf.has(c.id)) hidden.add(c.id);
    if (page.length < 500) break;
  }
  return hidden;
}

// ---------------------------------------------------------------------------------------------
// Post / comment visibility. One rule for every read path (detail, lists, profile lists, saved, liked):
//  - posts of a private community: members and site staff only
//  - content of shadow-banned authors: only the author themselves (and other shadow-banned viewers)

type PostLike = { authorId: number; communityId: number | null };
type CommentLike = { authorId: number; postId: number };

/** Whether the requesting user is shadow-banned (ban-check middleware flag or the users column). */
export function viewerIsShadowBanned(req: Request): boolean {
  return (req as any).isShadowBanned === true || !!(req.user as any)?.isShadowBanned;
}

/**
 * Which accounts counts (comments, likes, followers) and follower lists include for this viewer: everyone
 * for site staff and shadow-banned viewers (they see shadow-banned content anyway), otherwise everyone but
 * shadow-banned accounts — except the viewer themselves.
 */
export type ShadowScope = { includeShadowBanned: boolean; viewerId?: number };
export function shadowCountScope(req: Request): ShadowScope {
  const viewerId = req.isAuthenticated?.() ? (req.user as any)?.id : undefined;
  return { includeShadowBanned: viewerIsShadowBanned(req) || isStaff(req.isAuthenticated?.() ? req.user : undefined), viewerId };
}

/** Author ids among `authorIds` whose content is hidden from this viewer by a shadow ban. */
async function shadowHiddenAuthors(req: Request, authorIds: number[]): Promise<Set<number>> {
  if (viewerIsShadowBanned(req) || isStaff(req.user)) return new Set();
  const viewerId = (req.user as any)?.id;
  const ids = Array.from(new Set(authorIds)).filter((id) => id && id !== viewerId);
  if (ids.length === 0) return new Set();
  const authors = await storage.getUsersByIds(ids);
  return new Set(authors.filter((u: any) => !!u.isShadowBanned).map((u: any) => u.id));
}

/** Drops items (posts, comments) whose author is shadow-banned, unless the viewer may still see them. */
export async function filterShadowHidden<T extends { authorId: number }>(req: Request, items: T[]): Promise<T[]> {
  if (items.length === 0) return items;
  const shadow = await shadowHiddenAuthors(req, items.map((i) => i.authorId));
  return shadow.size ? items.filter((i) => !shadow.has(i.authorId)) : items;
}

/** May the requesting user read this post (and its comments)? */
export async function canViewPost(req: Request, post: PostLike): Promise<boolean> {
  if (!(await canViewCommunity(req.user, post.communityId))) return false;
  return !(await shadowHiddenAuthors(req, [post.authorId])).has(post.authorId);
}

/**
 * May the requesting user comment on / react to / like comments of this post? It must be visible to them and
 * they must not be banned from its community (site staff always may).
 */
export async function canInteractWithPost(req: Request, post: PostLike): Promise<"ok" | "not_found" | "banned"> {
  if (!(await canViewPost(req, post))) return "not_found";
  const user = req.user as any;
  if (post.communityId && user && !isStaff(user) && (await storage.isUserBannedFromCommunity(post.communityId, user.id))) {
    return "banned";
  }
  return "ok";
}

/** Drops posts the requesting user may not see (private communities, shadow-banned authors). Keeps the order. */
export async function filterVisiblePosts<T extends PostLike>(req: Request, posts: T[]): Promise<T[]> {
  if (posts.length === 0) return posts;
  const hidden = posts.some((p) => p.communityId) ? await hiddenCommunityIds(req.user) : new Set<number>();
  const shadow = await shadowHiddenAuthors(req, posts.map((p) => p.authorId));
  return posts.filter((p) => !(p.communityId && hidden.has(p.communityId)) && !shadow.has(p.authorId));
}

/**
 * Drops comments the requesting user may not see: comments on posts they cannot see (private community,
 * shadow-banned post author, deleted post) and comments of shadow-banned authors.
 */
export async function filterVisibleComments<T extends CommentLike>(req: Request, comments: T[]): Promise<T[]> {
  if (comments.length === 0) return comments;
  const posts = await storage.getContentStore().getPostsByIds(Array.from(new Set(comments.map((c) => c.postId))));
  const visiblePostIds = new Set((await filterVisiblePosts(req, posts)).map((p) => p.id));
  const shadow = await shadowHiddenAuthors(req, comments.map((c) => c.authorId));
  return comments.filter((c) => visiblePostIds.has(c.postId) && !shadow.has(c.authorId));
}

/**
 * Sends a WebSocket event about a post only to users who may see it: everyone for posts outside private
 * communities, members and site staff for private ones. The event itself must carry ids only, never content —
 * clients fetch the content through the authorised HTTP routes.
 */
export async function broadcastAboutPost(post: PostLike, message: string, actorId: number = post.authorId): Promise<void> {
  const community = post.communityId ? await storage.getCommunity(post.communityId) : undefined;
  // Content of a shadow-banned author (a post, or a comment by `actorId`): only the author themselves, staff
  // and other shadow-banned users hear about it — like they are the only ones who can load it.
  const ids = Array.from(new Set([post.authorId, actorId].filter(Boolean)));
  const shadowAuthors = new Set(
    ids.length ? (await storage.getUsersByIds(ids)).filter((u: any) => !!u.isShadowBanned).map((u: any) => u.id) : [],
  );
  if (!community?.isPrivate && shadowAuthors.size === 0) {
    broadcastMessage(message);
    return;
  }
  const userIds = Array.from(connections.keys());
  if (userIds.length === 0) return;
  const users = new Map((await storage.getUsersByIds(userIds)).map((u: any) => [u.id, u]));
  for (const userId of userIds) {
    const user = users.get(userId);
    if (!user) continue;
    if (shadowAuthors.size > 0 && !isStaff(user) && !user.isShadowBanned && !shadowAuthors.has(userId)) continue;
    if (community?.isPrivate && !isStaff(user) && !(await storage.getCommunityMember(community.id, userId))) continue;
    sendToUser(userId, message);
  }
}
