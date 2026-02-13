import { Express } from "express";

/**
 * Determines if a user has permission to delete content (post/comment).
 * @param requestingUser The user attempting the deletion
 * @param authorId The ID of the content's author
 * @param targetUserRole The role of the content's author
 */
export const canDeleteContent = (requestingUser: any, authorId: number, targetUserRole: string): boolean => {
    if (requestingUser.role === 'owner') return true; // Owner can delete anything
    if (requestingUser.role === 'admin' && targetUserRole !== 'owner') return true; // Admin can delete non-owner content
    if (authorId === requestingUser.id) return true; // Users can delete their own content
    return false;
};
