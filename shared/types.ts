import type { Post } from "./schema";

/**
 * Enriched post DTO returned by the API with author, comments, and reactions.
 * Used across media, discussions, communities, and post-view pages.
 */
export type PostWithAuthor = Post & {
    author: {
        username: string;
        id: number;
        isFollowing: boolean;
        role: string;
        verified: boolean;
    };
    comments: CommentWithAuthor[];
    reactions: {
        likes: number;
        dislikes: number;
    };
    userReaction: {
        isLike: boolean;
    } | null;
};

/** Enriched comment DTO returned nested within PostWithAuthor. */
export type CommentWithAuthor = {
    id: number;
    content: string;
    author: {
        username: string;
        role: string;
        verified: boolean;
    };
    createdAt: string;
    likes: number;
    isLiked: boolean;
};
