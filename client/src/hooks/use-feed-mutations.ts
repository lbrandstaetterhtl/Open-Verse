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

    // Post lists live under /api/posts... (feeds, detail) and /api/users/<name>/<tab> (profile tabs).
    const isPostQuery = (key: readonly unknown[]) =>
        typeof key[0] === "string" && (key[0].startsWith("/api/posts") || key[0].startsWith("/api/users/"));

    /** Applies `updater` to the post with this id wherever it is cached. Returns a snapshot for rollback. */
    const updatePostInCache = (postId: number, updater: (old: any) => any) => {
        const snapshot = queryClient.getQueriesData({ predicate: (q) => isPostQuery(q.queryKey) });
        queryClient.setQueriesData({ predicate: (q) => isPostQuery(q.queryKey) }, (old: any) => {
            if (!old) return old;
            if (Array.isArray(old)) return old.map((p) => (p?.id === postId ? updater(p) : p));
            if (old.pages) {
                return {
                    ...old,
                    pages: old.pages.map((page: any) => ({
                        ...page,
                        data: page.data?.map((p: any) => (p.id === postId ? updater(p) : p)),
                    })),
                };
            }
            if (old.id === postId) return updater(old);
            return old;
        });
        return snapshot;
    };

    const restore = (snapshot?: [readonly unknown[], unknown][]) => {
        snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data));
    };

    const refreshPostQueries = () => queryClient.invalidateQueries({ predicate: (q) => isPostQuery(q.queryKey) });

    // The server toggles: sending the same reaction again removes it.
    const reactionMutation = useMutation<any, Error, { postId: number; isLike: boolean }, { snapshot: [readonly unknown[], unknown][] }>({
        mutationFn: async ({ postId, isLike }) => {
            const res = await apiRequest("POST", `/api/posts/${postId}/react`, { isLike });
            return res.json();
        },
        onMutate: async ({ postId, isLike }) => {
            await queryClient.cancelQueries({ predicate: (q) => isPostQuery(q.queryKey) });
            const snapshot = updatePostInCache(postId, (old: any) => {
                const prev = old.userReaction ? !!old.userReaction.isLike : undefined;
                const removing = prev === isLike;
                const reactions = old.reactions ?? { likes: 0, dislikes: 0 };
                const likes = reactions.likes + (isLike ? (removing ? -1 : 1) : prev === true ? -1 : 0);
                const dislikes = reactions.dislikes + (!isLike ? (removing ? -1 : 1) : prev === false ? -1 : 0);
                return {
                    ...old,
                    userReaction: removing ? null : { isLike },
                    reactions: { likes: Math.max(0, likes), dislikes: Math.max(0, dislikes) },
                };
            });
            return { snapshot };
        },
        onError: (_err, _vars, context) => {
            restore(context?.snapshot);
            toast({ title: "Like failed", variant: "destructive" });
        },
        onSettled: () => refreshPostQueries(),
    });

    // Bookmarks ("Merken"): saved=true saves, saved=false removes.
    const saveMutation = useMutation<any, Error, { postId: number; saved: boolean }, { snapshot: [readonly unknown[], unknown][] }>({
        mutationFn: async ({ postId, saved }) => {
            const res = await apiRequest(saved ? "POST" : "DELETE", `/api/posts/${postId}/save`);
            return res.json();
        },
        onMutate: async ({ postId, saved }) => {
            await queryClient.cancelQueries({ predicate: (q) => isPostQuery(q.queryKey) });
            const snapshot = updatePostInCache(postId, (old: any) => ({ ...old, isSaved: saved }));
            return { snapshot };
        },
        onError: (_err, _vars, context) => {
            restore(context?.snapshot);
            toast({ title: "Saving failed", variant: "destructive" });
        },
        onSuccess: (_data, { saved }) => {
            toast({ title: saved ? "Saved" : "Removed from saved" });
        },
        onSettled: () => refreshPostQueries(),
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
            refreshPostQueries();
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

    const prefetchPost = (postId: number) => {
        queryClient.prefetchQuery({
            queryKey: ["/api/posts", postId],
            queryFn: async () => {
                const res = await fetch(`/api/posts/${postId}`);
                if (!res.ok) throw new Error("Failed to fetch post");
                return res.json();
            },
            staleTime: 5 * 60 * 1000, // 5 minutes
        });
    };

    return {
        reactionMutation,
        saveMutation,
        followMutation,
        unfollowMutation,
        createCommentMutation,
        deletePostMutation,
        deleteCommentMutation,
        likeCommentMutation,
        prefetchPost,
    };
}
