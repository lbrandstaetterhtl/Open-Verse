import { storage } from "../storage";

/**
 * Per-post fields every post list returns: whether the current user saved the post ("Merken") and how
 * many comments it has. Two batched queries for the whole list.
 */
export async function getPostExtras(postIds: number[], userId?: number) {
  const [savedIds, commentCounts] = await Promise.all([
    userId ? storage.getSavedPostIds(userId, postIds) : Promise.resolve(new Set<number>()),
    storage.getBatchCommentCounts(postIds),
  ]);
  return (postId: number) => ({
    isSaved: savedIds.has(postId),
    commentCount: commentCounts.get(postId) ?? 0,
  });
}
