import { useTranslation } from "react-i18next";
import { useRoute, Link } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Post } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ThumbsUp, ThumbsDown, Loader2, MessageCircle, Trash2, Heart, BadgeCheck, ImageOff, ArrowLeft } from "lucide-react";
import { ReportDialog } from "@/components/dialogs/report-dialog";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Input } from "@/components/ui/input";
import { useState } from "react";

type PostWithAuthor = Post & {
    author: {
        username: string;
        id: number;
        isFollowing: boolean;
        role: string;
        verified: boolean;
    };
    comments: Array<{
        id: number;
        content: string;
        author: { username: string; role: string; verified: boolean };
        createdAt: string;
        likes: number;
        isLiked: boolean;
    }>;
    likes: number;
    userVote: {
        isLike: boolean;
    } | null;
};

export default function PostViewPage() {
    const { t } = useTranslation();
    const { toast } = useToast();
    const { user } = useAuth();
    const [, params] = useRoute("/posts/:id");
    const postId = params?.id ? parseInt(params.id) : null;
    const [imageLoadError, setImageLoadError] = useState(false);

    // Check navigation source
    const urlParams = new URLSearchParams(window.location.search);
    const fromSource = urlParams.get('from');
    const username = urlParams.get('username');

    const backLink = fromSource === 'admin' ? '/admin'
        : fromSource === 'profile' && username ? `/users/${username}`
            : '/feed/media';
    const backText = fromSource === 'admin' ? 'Back to Admin'
        : fromSource === 'profile' ? 'Back to Profile'
            : 'Back to Feed';

    const { data: post, isLoading, error } = useQuery<PostWithAuthor>({
        queryKey: ["/api/posts", postId],
        queryFn: async () => {
            if (!postId) throw new Error("No post ID");
            const res = await fetch(`/api/posts/${postId}`);
            if (!res.ok) throw new Error("Failed to fetch post");
            return res.json();
        },
        enabled: !!postId,
        refetchInterval: 1000,
        refetchOnWindowFocus: true,
        refetchOnMount: true,
    });

    const reactionMutation = useMutation<Post, Error, { isLike: boolean }>({
        mutationFn: async ({ isLike }) => {
            if (!postId) throw new Error("No post ID");
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
            if (!res.ok) throw new Error(await res.text());
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
            toast({ title: "Success", description: "User followed successfully" });
        },
    });

    const unfollowMutation = useMutation({
        mutationFn: async (userId: number) => {
            const res = await apiRequest("DELETE", `/api/follow/${userId}`);
            if (!res.ok) throw new Error(await res.text());
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
            toast({ title: "Success", description: "User unfollowed successfully" });
        },
    });

    const createCommentMutation = useMutation({
        mutationFn: async ({ content }: { content: string }) => {
            if (!postId) throw new Error("No post ID");
            const res = await apiRequest("POST", "/api/comments", { postId, content });
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
            toast({ title: "Success", description: "Comment added successfully" });
        },
    });

    const deleteCommentMutation = useMutation({
        mutationFn: async (commentId: number) => {
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

    const deletePostMutation = useMutation({
        mutationFn: async () => {
            if (!postId) throw new Error("No post ID");
            const res = await apiRequest("DELETE", `/api/posts/${postId}`);
            if (!res.ok) throw new Error(await res.text());
        },
        onSuccess: () => {
            toast({ title: "Success", description: "Post deleted successfully" });
            window.location.href = "/feed/media";
        },
    });

    return (
        <>
            <Navbar />
            <main className="container mx-auto px-4 pt-24">
                <div className="max-w-3xl mx-auto">
                    <Button
                        variant="ghost"
                        size="sm"
                        asChild
                        className="mb-4"
                    >
                        <Link href={backLink}>
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            {t('actions.back', backText)}
                        </Link>
                    </Button>

                    {isLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : error ? (
                        <Alert variant="destructive">
                            <AlertDescription>Error loading post: {error.message}</AlertDescription>
                        </Alert>
                    ) : !post ? (
                        <Alert variant="destructive">
                            <AlertDescription>Post not found</AlertDescription>
                        </Alert>
                    ) : (
                        <Card className="overflow-hidden">
                            <CardHeader className="p-4 lg:p-6">
                                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <Link href={`/users/${post.author.username}`} className="hover:opacity-80">
                                            <UserAvatar user={post.author} size="sm" />
                                        </Link>
                                        <div className="min-w-0">
                                            <CardTitle className="text-base lg:text-lg truncate">{post.title}</CardTitle>
                                            <div className="flex items-center gap-1">
                                                <Link href={`/users/${post.author.username}`} className="hover:underline text-xs lg:text-sm text-muted-foreground">
                                                    {post.author.username}
                                                </Link>
                                                {post.author.verified && (
                                                    <BadgeCheck className="h-4 w-4 text-blue-500" />
                                                )}
                                                <span className="text-xs lg:text-sm text-muted-foreground">
                                                    {" • "}
                                                    {format(new Date(post.createdAt), "PPP")}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-primary text-xs lg:text-sm">
                                            {post.category}
                                        </Badge>
                                        {post.author.id !== user?.id && (
                                            <Button
                                                variant={post.author.isFollowing ? "default" : "outline"}
                                                size="sm"
                                                onClick={() => {
                                                    if (post.author.isFollowing) {
                                                        unfollowMutation.mutate(post.author.id);
                                                    } else {
                                                        followMutation.mutate(post.author.id);
                                                    }
                                                }}
                                                disabled={followMutation.isPending || unfollowMutation.isPending}
                                                className="text-xs lg:text-sm"
                                            >
                                                {post.author.isFollowing ? t('feed.following') : t('feed.follow')}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-4 lg:p-6">
                                <p className="text-sm lg:text-base whitespace-pre-wrap mb-4">{post.content}</p>

                                {post.mediaUrl && !imageLoadError && (
                                    <div className="mt-4 rounded-lg overflow-hidden bg-muted/10">
                                        {post.mediaType === "image" ? (
                                            <div className="flex items-center justify-center min-h-[200px] max-h-[500px] bg-muted/5">
                                                <img
                                                    src={`/uploads/${post.mediaUrl}`}
                                                    alt={post.title || "Post image"}
                                                    className="max-w-full h-auto max-h-[500px] rounded-lg"
                                                    onError={() => setImageLoadError(true)}
                                                    loading="lazy"
                                                />
                                            </div>
                                        ) : post.mediaType === "video" ? (
                                            <div className="flex items-center justify-center min-h-[200px] max-h-[500px] bg-muted/5">
                                                <video
                                                    src={`/uploads/${post.mediaUrl}`}
                                                    controls
                                                    className="max-w-full max-h-[500px] rounded-lg"
                                                    onError={() => setImageLoadError(true)}
                                                />
                                            </div>
                                        ) : null}
                                    </div>
                                )}

                                {imageLoadError && (
                                    <div className="mt-4 p-4 rounded-lg bg-muted/10 flex items-center justify-center gap-2 text-muted-foreground">
                                        <ImageOff className="h-5 w-5" />
                                        <span>Media failed to load</span>
                                    </div>
                                )}

                                <div className="mt-6 space-y-4">
                                    <h3 className="text-sm lg:text-base font-semibold flex items-center gap-2">
                                        <MessageCircle className="h-4 w-4" />
                                        {t('comments.title')}
                                    </h3>

                                    <div className="flex gap-2">
                                        <Input
                                            id="comment-input"
                                            placeholder={t('comments.placeholder')}
                                            className="text-sm"
                                            onKeyPress={(e) => {
                                                if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) {
                                                    createCommentMutation.mutate({
                                                        content: (e.target as HTMLInputElement).value.trim(),
                                                    });
                                                    (e.target as HTMLInputElement).value = "";
                                                }
                                            }}
                                        />
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                const input = document.getElementById("comment-input") as HTMLInputElement;
                                                if (input?.value?.trim()) {
                                                    createCommentMutation.mutate({ content: input.value.trim() });
                                                    input.value = "";
                                                }
                                            }}
                                        >
                                            {t('comments.post_button')}
                                        </Button>
                                    </div>

                                    <div className="space-y-3">
                                        {post.comments?.map((comment) => (
                                            <div key={comment.id} className="bg-muted/50 rounded-lg p-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <Link href={`/users/${comment.author.username}`} className="hover:opacity-80">
                                                            <UserAvatar user={comment.author} size="sm" />
                                                        </Link>
                                                        <div>
                                                            <div className="flex items-center gap-1">
                                                                <Link href={`/users/${comment.author.username}`} className="text-xs lg:text-sm font-medium hover:underline">
                                                                    {comment.author.username}
                                                                </Link>
                                                                {comment.author.verified && (
                                                                    <BadgeCheck className="h-4 w-4 text-blue-500" />
                                                                )}
                                                            </div>
                                                            <span className="text-xs text-muted-foreground block">
                                                                {format(new Date(comment.createdAt), "PPp")}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        <Button
                                                            variant={comment.isLiked ? "default" : "ghost"}
                                                            size="sm"
                                                            onClick={() => likeCommentMutation.mutate(comment.id)}
                                                            disabled={likeCommentMutation.isPending}
                                                            className="h-8"
                                                        >
                                                            <Heart className={`h-4 w-4 mr-1 ${comment.isLiked ? "fill-current" : ""}`} />
                                                            <span className="text-xs">{comment.likes}</span>
                                                        </Button>
                                                        {(comment.author.username === user?.username ||
                                                            user?.role === "owner" ||
                                                            (user?.role === "admin" && comment.author.role !== "owner")) && (
                                                                <AlertDialog>
                                                                    <AlertDialogTrigger asChild>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            disabled={deleteCommentMutation.isPending}
                                                                            className="h-8 w-8 p-0"
                                                                        >
                                                                            <Trash2 className="h-4 w-4" />
                                                                        </Button>
                                                                    </AlertDialogTrigger>
                                                                    <AlertDialogContent>
                                                                        <AlertDialogHeader>
                                                                            <AlertDialogTitle>Delete Comment</AlertDialogTitle>
                                                                            <AlertDialogDescription>
                                                                                Are you sure you want to delete this comment? This action cannot be undone.
                                                                            </AlertDialogDescription>
                                                                        </AlertDialogHeader>
                                                                        <AlertDialogFooter>
                                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                            <AlertDialogAction
                                                                                onClick={() => deleteCommentMutation.mutate(comment.id)}
                                                                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                                            >
                                                                                Delete
                                                                            </AlertDialogAction>
                                                                        </AlertDialogFooter>
                                                                    </AlertDialogContent>
                                                                </AlertDialog>
                                                            )}
                                                    </div>
                                                </div>
                                                <p className="text-xs lg:text-sm mt-2 pl-10">{comment.content}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="p-4 lg:p-6 flex flex-wrap gap-4 items-center justify-between">
                                <div className="flex items-center space-x-2">
                                    <Button
                                        variant={post.userVote?.isLike ? "default" : "ghost"}
                                        size="sm"
                                        onClick={() => reactionMutation.mutate({ isLike: true })}
                                        disabled={reactionMutation.isPending}
                                        className="h-8"
                                    >
                                        <ThumbsUp className={`h-4 w-4 mr-1 ${post.userVote?.isLike ? "fill-current" : ""}`} />
                                        <span className="text-xs lg:text-sm">{post.likes > 0 ? post.likes : 0}</span>
                                    </Button>
                                    <Button
                                        variant={post.userVote?.isLike === false ? "default" : "ghost"}
                                        size="sm"
                                        onClick={() => reactionMutation.mutate({ isLike: false })}
                                        disabled={reactionMutation.isPending}
                                        className="h-8"
                                    >
                                        <ThumbsDown className={`h-4 w-4 mr-1 ${post.userVote?.isLike === false ? "fill-current" : ""}`} />
                                    </Button>
                                </div>

                                <div className="flex items-center space-x-2">
                                    {(user?.role === "owner" ||
                                        (user?.role === "admin" && post.author.role !== "owner") ||
                                        post.author.id === user?.id) && (
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        disabled={deletePostMutation.isPending}
                                                        className="h-8"
                                                    >
                                                        {deletePostMutation.isPending ? (
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                        ) : (
                                                            <>
                                                                <Trash2 className="h-4 w-4 mr-1" />
                                                                <span className="text-xs lg:text-sm">{t('actions.delete')}</span>
                                                            </>
                                                        )}
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Delete Post</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Are you sure you want to delete this post? This action cannot be undone.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction
                                                            onClick={() => deletePostMutation.mutate()}
                                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                        >
                                                            Delete
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        )}
                                    <ReportDialog type="post" id={post.id} />
                                </div>
                            </CardFooter>
                        </Card>
                    )}
                </div>
            </main>
        </>
    );
}
