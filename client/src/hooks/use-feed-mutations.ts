import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Post } from "@shared/schema";

/**
 * Shared mutations used across feed pages (media, discussions, communities).
 * Eliminates copy-paste of follow/unfollow/react/comment/delete logic.
 */
export function useFeedMutations() {
    const { toast } = useToast();

    const reactionMutation = useMutation<Post, Error, { postId: number; isLike: boolean }>({
        mutationFn: async ({ postId, isLike }) => {
            const res = await apiRequest("POST", `/api/posts/${postId}/react`, { isLike });
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
        },
    });

    const followMutation = useMutation({
        mutationFn: async (userId: number) => {
            const res = await apiRequest("POST", `/api/follow/${userId}`);
            if (!res.ok) {
                const error = await res.text();
                throw new Error(error);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
            queryClient.invalidateQueries({ queryKey: ["/api/following"] });
            toast({ title: "Success", description: "User followed successfully" });
        },
        onError: (error: Error) => {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        },
    });

    const unfollowMutation = useMutation({
        mutationFn: async (userId: number) => {
            const res = await apiRequest("DELETE", `/api/follow/${userId}`);
            if (!res.ok) {
                const error = await res.text();
                throw new Error(error);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
            queryClient.invalidateQueries({ queryKey: ["/api/following"] });
            toast({ title: "Success", description: "User unfollowed successfully" });
        },
        onError: (error: Error) => {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        },
    });

    const createCommentMutation = useMutation({
        mutationFn: async ({ postId, content }: { postId: number; content: string }) => {
            const res = await apiRequest("POST", "/api/comments", { postId, content });
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
            toast({ title: "Success", description: "Comment added successfully" });
        },
    });

    const deletePostMutation = useMutation({
        mutationFn: async (postId: number) => {
            const res = await apiRequest("DELETE", `/api/posts/${postId}`);
            if (!res.ok) {
                const error = await res.text();
                throw new Error(error);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
            toast({ title: "Success", description: "Post deleted successfully" });
        },
        onError: (error: Error) => {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        },
    });

    const deleteCommentMutation = useMutation({
        mutationFn: async ({ commentId }: { postId: number; commentId: number }) => {
            const res = await apiRequest("DELETE", `/api/comments/${commentId}`);
            if (!res.ok) {
                const error = await res.text();
                throw new Error(error);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
            toast({ title: "Success", description: "Comment deleted successfully" });
        },
        onError: (error: Error) => {
            toast({ title: "Error", description: error.message, variant: "destructive" });
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
