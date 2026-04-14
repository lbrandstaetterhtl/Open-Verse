import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PostWithAuthor } from "@shared/types";

/**
 * Shared mutations used across feed pages (media, discussions, communities).
 * Optimized with Optimistic Updates for a "Smooth" feel.
 */
export function useFeedMutations() {
    const { toast } = useToast();

    // Helper to update both specific post and feeds
    const updatePostInCache = (postId: number, updater: (old: any) => any) => {
        // 1. Update Post Detail Query
        queryClient.setQueryData(["/api/posts", postId], updater);

        // 2. Update all Feed Queries
        queryClient.setQueriesData({ queryKey: ["/api/posts"] }, (old: any) => {
            if (!old) return old;
            
            // Handle both flat arrays and paginated data
            if (Array.isArray(old)) {
                return old.map(p => p.id === postId ? updater(p) : p);
            }
            
            if (old.pages) {
                return {
                    ...old,
                    pages: old.pages.map((page: any) => ({
                        ...page,
                        data: page.data?.map((p: any) => p.id === postId ? updater(p) : p)
                    }))
                };
            }
            return old;
        });
    };

    const reactionMutation = useMutation<any, Error, { postId: number; isLike: boolean }>({
        mutationFn: async ({ postId, isLike }) => {
            const res = await apiRequest("POST", `/api/posts/${postId}/react`, { isLike });
            return res.json();
        },
        // SMOOTH-FIX: Optimistic Update for reactions
        onMutate: async ({ postId, isLike }) => {
            await queryClient.cancelQueries({ queryKey: ["/api/posts"] });
            const previousPosts = queryClient.getQueryData(["/api/posts"]);

            updatePostInCache(postId, (old: any) => {
                if (!old) return old;
                const prevUserReaction = old.userReaction?.isLike;
                const newLikes = old.reactions.likes + (isLike ? (prevUserReaction === true ? 0 : 1) : (prevUserReaction === true ? -1 : 0));
                const newDislikes = old.reactions.dislikes + (!isLike ? (prevUserReaction === false ? 0 : 1) : (prevUserReaction === false ? -1 : 0));
                
                return {
                    ...old,
                    userReaction: { isLike },
                    reactions: { likes: newLikes, dislikes: newDislikes }
                };
            });

            return { previousPosts };
        },
        onError: (_, __, context) => {
            if (context?.previousPosts) {
                queryClient.setQueryData(["/api/posts"], context.previousPosts);
            }
        },
        onSettled: (data, error, { postId }) => {
            queryClient.invalidateQueries({ queryKey: ["/api/posts", postId] });
        },
    });

    const followMutation = useMutation({
        mutationFn: async (userId: number) => {
            const res = await apiRequest("POST", `/api/follow/${userId}`);
            if (!res.ok) throw new Error(await res.text());
        },
        // SMOOTH-FIX: Optimistic Update for follow
        onMutate: async (userId) => {
            await queryClient.cancelQueries({ queryKey: ["/api/posts"] });
            const previous = queryClient.getQueryData(["/api/posts"]);

            queryClient.setQueriesData({ queryKey: ["/api/posts"] }, (old: any) => {
                const update = (p: any) => p.author?.id === userId ? { ...p, author: { ...p.author, isFollowing: true } } : p;
                if (Array.isArray(old)) return old.map(update);
                return old; // Simplification for feed pages
            });

            return { previous };
        },
        onError: (err, _, context) => {
            queryClient.setQueryData(["/api/posts"], context?.previous);
            toast({ title: "Error", description: err.message, variant: "destructive" });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
            queryClient.invalidateQueries({ queryKey: ["/api/following"] });
        }
    });

    const unfollowMutation = useMutation({
        mutationFn: async (userId: number) => {
            const res = await apiRequest("DELETE", `/api/follow/${userId}`);
            if (!res.ok) throw new Error(await res.text());
        },
        // SMOOTH-FIX: Optimistic Update for unfollow
        onMutate: async (userId) => {
            await queryClient.cancelQueries({ queryKey: ["/api/posts"] });
            const previous = queryClient.getQueryData(["/api/posts"]);

            queryClient.setQueriesData({ queryKey: ["/api/posts"] }, (old: any) => {
                const update = (p: any) => p.author?.id === userId ? { ...p, author: { ...p.author, isFollowing: false } } : p;
                if (Array.isArray(old)) return old.map(update);
                return old;
            });

            return { previous };
        },
        onError: (err, _, context) => {
            queryClient.setQueryData(["/api/posts"], context?.previous);
            toast({ title: "Error", description: err.message, variant: "destructive" });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
            queryClient.invalidateQueries({ queryKey: ["/api/following"] });
        }
    });

    const createCommentMutation = useMutation({
        mutationFn: async ({ postId, content }: { postId: number; content: string }) => {
            const res = await apiRequest("POST", "/api/comments", { postId, content });
            return res.json();
        },
        onSuccess: (data, { postId }) => {
            queryClient.invalidateQueries({ queryKey: ["/api/posts", postId] });
            queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
            toast({ title: t("comments.success"), description: t("comments.added") });
        },
    });

    // Re-adding t-function if it was missing or assuming it's injected
    const t = (key: string) => key; // placeholder for now, would use i18n usually

    const deletePostMutation = useMutation({
        mutationFn: async (postId: number) => {
            const res = await apiRequest("DELETE", `/api/posts/${postId}`);
            if (!res.ok) throw new Error(await res.text());
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
            toast({ title: "Success", description: "Post deleted successfully" });
        },
    });

    const deleteCommentMutation = useMutation({
        mutationFn: async ({ commentId }: { postId: number; commentId: number }) => {
            const res = await apiRequest("DELETE", `/api/comments/${commentId}`);
            if (!res.ok) throw new Error(await res.text());
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
            toast({ title: "Success", description: "Comment deleted successfully" });
        },
    });

    const likeCommentMutation = useMutation({
        mutationFn: async (commentId: number) => {
            const res = await apiRequest("POST", `/api/comments/${commentId}/like`);
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
        },
    });

    return {
        reactionMutation,
        followMutation,
        unfollowMutation,
        createCommentMutation,
        deletePostMutation,
        deleteCommentMutation,
        likeCommentMutation,
    };
}
