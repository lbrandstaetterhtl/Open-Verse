import { storage } from "../storage";
import type { ShadowScope } from "../storage/content-storage";

/**
 * Per-post fields every post list returns: whether the current user saved the post ("Merken") and how
 * many comments it has. Two batched queries for the whole list.
 */
export async function getPostExtras(postIds: number[], userId?: number, scope?: ShadowScope) {
  const [savedIds, commentCounts] = await Promise.all([
    userId ? storage.getSavedPostIds(userId, postIds) : Promise.resolve(new Set<number>()),
    // `scope`: comments of shadow-banned accounts are not counted for viewers who cannot see them
    storage.getContentStore().getBatchCommentCounts(postIds, scope),
  ]);
  return (postId: number) => ({
    isSaved: savedIds.has(postId),
    commentCount: commentCounts.get(postId) ?? 0,
  });
}

// Stands in for the author of posts and comments whose user was deleted (their author_id is set to 0).
export const DELETED_AUTHOR = { id: null, username: "[deleted]", role: "user", verified: false, isFollowing: false, deleted: true };
