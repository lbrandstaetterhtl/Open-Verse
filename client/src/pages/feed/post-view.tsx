import { useRoute, Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Post } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
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
import { Heart, Loader2, MessageCircle, Trash2, BadgeCheck, ImageOff, ArrowLeft, Bookmark, Share2 } from "lucide-react";
import { useFeedMutations } from "@/hooks/use-feed-mutations";
import { sharePost } from "@/lib/share-post";
import { ReportDialog } from "@/components/dialogs/report-dialog";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { AuthorLink, authorName, isDeletedAuthor } from "@/components/post/author-link";

import { useDateLocale } from "@/lib/date-locale";
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
  const dateLocale = useDateLocale();
  const { toast } = useToast();
  const { saveMutation } = useFeedMutations();
  const { user } = useAuth();
  const [, params] = useRoute("/posts/:id");
  const [, legacyParams] = useRoute("/post/:id");
  const id = params?.id ?? legacyParams?.id;
  const postId = id ? parseInt(id) : null;
  const [imageLoadError, setImageLoadError] = useState(false);
  const [, navigate] = useLocation();

  // Check navigation source
  const urlParams = new URLSearchParams(window.location.search);
  const fromSource = urlParams.get("from");
  const username = urlParams.get("username");

  const backLink =
    fromSource === "admin"
      ? "/admin"
      : fromSource === "profile" && username
        ? `/users/${username}`
        : "/feed/media";
  const backText =
    fromSource === "admin"
      ? t("post.back_to_admin", "Back to Admin")
      : fromSource === "profile"
        ? t("post.back_to_profile", "Back to Profile")
        : t("post.back_to_feed", "Back to Feed");

  const {
    data: post,
    isLoading,
    error,
  } = useQuery<PostWithAuthor | null>({
    queryKey: ["/api/posts", postId],
    queryFn: async () => {
      if (!postId) throw new Error("No post ID");
      const res = await fetch(`/api/posts/${postId}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(t("post_actions.load_failed", "The post could not be loaded."));
      return res.json();
    },
    enabled: !!postId,
    refetchInterval: 30000,
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
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/users/") });
    },
  });

  const followMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("POST", `/api/follow/${userId}`);
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      toast({ title: t("common.success", "Success"), description: t("post.user_followed", "User followed successfully") });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("DELETE", `/api/follow/${userId}`);
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      toast({ title: t("common.success", "Success"), description: t("post.user_unfollowed", "User unfollowed successfully") });
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
      toast({ title: t("common.success", "Success"), description: t("comments.added", "Your comment has been added.") });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: number) => {
      const res = await apiRequest("DELETE", `/api/comments/${commentId}`);
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      toast({ title: t("common.success", "Success"), description: t("comments.deleted_success", "Comment deleted successfully") });
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
      toast({ title: t("common.success", "Success"), description: t("posts.deleted_success", "Post deleted successfully") });
      navigate("/feed/media");
    },
  });

  // The post endpoint sends isFollowing next to the author, not inside it.
  const authorDeleted = isDeletedAuthor(post?.author as any);
  const isFollowingAuthor = !!((post as any)?.isFollowing ?? post?.author?.isFollowing);

  return (
    <div className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <Link href={backLink}>
            <Button variant="ghost" size="sm" className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {backText}
            </Button>
          </Link>

          {isLoading ? (
            <Spinner size="lg" className="p-8" />
          ) : error ? (
            <ErrorState title={t("post_actions.load_failed_title", "Something went wrong")} message={error.message} />
          ) : !post ? (
            <EmptyState
              title={t("post_actions.not_found", "Post not found")}
              description={t("post_actions.not_found_hint", "This post doesn't exist anymore or the link is wrong.")}
            />
          ) : (
            <Card className="overflow-hidden">
              <CardHeader className="p-4 lg:p-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <AuthorLink author={post.author} className="hover:opacity-80">
                      <UserAvatar user={authorDeleted ? { username: "?" } : post.author} size="sm" />
                    </AuthorLink>
                    <div className="min-w-0">
                      <CardTitle className="text-base lg:text-lg truncate">{post.title}</CardTitle>
                      <div className="flex items-center gap-1">
                        <AuthorLink
                          author={post.author}
                          className="hover:underline text-xs lg:text-sm text-muted-foreground"
                        >
                          {authorName(post.author)}
                        </AuthorLink>
                        {post.author?.verified && <BadgeCheck className="h-4 w-4 shrink-0 text-star" />}
                        <span className="font-data text-xs text-muted-foreground">
                          {" • "}
                          {format(new Date(post.createdAt), "PPP", { locale: dateLocale })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="ov-chip ov-chip-primary">
                      {t(`community.page.tabs.${post.category}`, post.category)}
                    </span>
                    {!authorDeleted && post.author.id !== user?.id && (
                      <Button
                        variant={isFollowingAuthor ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          if (isFollowingAuthor) {
                            unfollowMutation.mutate(post.author.id);
                          } else {
                            followMutation.mutate(post.author.id);
                          }
                        }}
                        disabled={followMutation.isPending || unfollowMutation.isPending}
                        className="text-xs lg:text-sm"
                      >
                        {isFollowingAuthor ? t("feed.following") : t("feed.follow")}
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 lg:p-6">
                <p className="text-sm lg:text-base whitespace-pre-wrap mb-4">{post.content}</p>

                {post.mediaUrl && !imageLoadError && (
                  <div className="ov-cut-2 mt-4 rounded-xl overflow-hidden bg-muted/20">
                    {post.mediaType === "image" ? (
                      <div className="flex items-center justify-center min-h-[200px] max-h-[500px] bg-muted/5">
                        <img
                          src={`/uploads/${post.mediaUrl}`}
                          alt={post.title || t("post.image_alt", "Post image")}
                          className="max-w-full h-auto max-h-[500px]"
                          onError={() => setImageLoadError(true)}
                          loading="lazy"
                        />
                      </div>
                    ) : post.mediaType === "video" ? (
                      <div className="flex items-center justify-center min-h-[200px] max-h-[500px] bg-muted/5">
                        <video
                          src={`/uploads/${post.mediaUrl}`}
                          controls
                          className="max-w-full max-h-[500px]"
                          onError={() => setImageLoadError(true)}
                        />
                      </div>
                    ) : null}
                  </div>
                )}

                {imageLoadError && (
                  <div className="ov-cut-2 mt-4 p-4 rounded-xl bg-muted/20 flex items-center justify-center gap-2 text-muted-foreground">
                    <ImageOff className="h-5 w-5" />
                    <span>{t("media_feed.load_error", "Media failed to load")}</span>
                  </div>
                )}

                <div className="mt-6 space-y-4">
                  <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                    <MessageCircle className="h-4 w-4" />
                    {t("comments.title")}
                  </h3>

                  <div className="flex gap-2">
                    <Input
                      id="comment-input"
                      placeholder={t("comments.placeholder")}
                      className="text-sm"
                      onKeyDown={(e) => {
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
                        const input = document.querySelector("#comment-input") as HTMLInputElement;
                        if (input?.value?.trim()) {
                          createCommentMutation.mutate({ content: input.value.trim() });
                          input.value = "";
                        }
                      }}
                    >
                      {t("comments.post_button")}
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {post.comments?.map((comment) => (
                      <div key={comment.id} className="ov-panel p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <AuthorLink author={comment.author} className="hover:opacity-80">
                              <UserAvatar user={isDeletedAuthor(comment.author) ? { username: "?" } : comment.author} size="sm" />
                            </AuthorLink>
                            <div>
                              <div className="flex items-center gap-1">
                                <AuthorLink
                                  author={comment.author}
                                  className="text-xs lg:text-sm font-semibold hover:underline"
                                >
                                  {authorName(comment.author)}
                                </AuthorLink>
                                {comment.author?.verified && (
                                  <BadgeCheck className="h-4 w-4 shrink-0 text-star" />
                                )}
                              </div>
                              <span className="font-data text-xs text-muted-foreground block">
                                {format(new Date(comment.createdAt), "PPp", { locale: dateLocale })}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Button
                              variant={comment.isLiked ? "default" : "ghost"}
                              size="sm"
                              aria-label={t("post_actions.like_comment", "Like comment")}
                              aria-pressed={!!comment.isLiked}
                              onClick={() => likeCommentMutation.mutate(comment.id)}
                              disabled={likeCommentMutation.isPending}
                              className="h-8"
                            >
                              <Heart
                                className={`h-4 w-4 mr-1 ${comment.isLiked ? "fill-current" : ""}`}
                              />
                              <span className="ov-data text-xs">{comment.likes}</span>
                            </Button>
                            {((!isDeletedAuthor(comment.author) && comment.author.username === user?.username) ||
                              user?.role === "owner" ||
                              (user?.role === "admin" && comment.author?.role !== "owner")) && (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={deleteCommentMutation.isPending}
                                      className="h-8 w-8 p-0"
                                      aria-label={t("post_actions.delete_comment", "Delete comment")}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>{t("comments.delete_title", "Delete comment")}</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        {t("actions.delete_comment_confirm")}
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => deleteCommentMutation.mutate(comment.id)}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        {t("common.delete")}
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
                    aria-label={t("post_actions.like", "Like")}
                    aria-pressed={!!post.userVote?.isLike}
                  >
                    <Heart
                      className={`h-4 w-4 mr-1 ${post.userVote?.isLike ? "fill-current" : ""}`}
                    />
                    <span className="ov-data text-xs lg:text-sm">{post.likes > 0 ? post.likes : 0}</span>
                  </Button>
                  <Button
                    variant={(post as any).isSaved ? "default" : "ghost"}
                    size="sm"
                    className="h-8"
                    aria-label={t("post_actions.save", "Save")}
                    aria-pressed={!!(post as any).isSaved}
                    disabled={saveMutation.isPending}
                    onClick={() => saveMutation.mutate({ postId: post.id, saved: !(post as any).isSaved })}
                  >
                    <Bookmark className={`h-4 w-4 ${(post as any).isSaved ? "fill-current" : ""}`} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    aria-label={t("post_actions.share", "Share")}
                    onClick={() => sharePost(post, toast, {
                      copied: t("post_actions.link_copied", "Link copied"),
                      copyFailed: t("post_actions.copy_failed", "Copy this link"),
                    })}
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex items-center space-x-2">
                  {(user?.role === "owner" ||
                    (user?.role === "admin" && post.author?.role !== "owner") ||
                    (!authorDeleted && post.author.id === user?.id)) && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={deletePostMutation.isPending}
                            className="h-8"
                            aria-label={t("post_actions.delete_post", "Delete post")}
                          >
                            {deletePostMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Trash2 className="h-4 w-4 lg:mr-1" />
                                <span className="text-xs lg:text-sm hidden lg:inline">{t("actions.delete")}</span>
                              </>
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t("posts.delete_title", "Delete post")}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t("actions.delete_post_confirm")}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deletePostMutation.mutate()}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {t("common.delete")}
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
    </div>
  );
}
