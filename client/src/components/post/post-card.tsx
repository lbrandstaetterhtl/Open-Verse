import { Link } from "wouter";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useFeedMutations } from "@/hooks/use-feed-mutations";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ReportDialog } from "@/components/dialogs/report-dialog";
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
import {
  ThumbsUp,
  ThumbsDown,
  MessageCircle,
  Trash2,
  Heart,
  BadgeCheck,
  ImageOff,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PostWithAuthor } from "@shared/types";

interface PostCardProps {
  post: PostWithAuthor;
  /** Type used for the ReportDialog (e.g. "post" | "discussion"). Defaults to "post". */
  reportType?: "post" | "discussion";
}

export function PostCard({ post, reportType = "post" }: PostCardProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [imageLoadError, setImageLoadError] = useState(false);

  const {
    reactionMutation,
    followMutation,
    unfollowMutation,
    createCommentMutation,
    deletePostMutation,
    deleteCommentMutation,
    likeCommentMutation,
  } = useFeedMutations();

  const author = post.author ?? {
    username: "Unknown",
    id: 0,
    isFollowing: false,
    role: "member",
    verified: false,
  };
  const comments = post.comments ?? [];
  const reactions = post.reactions ?? { likes: 0, dislikes: 0 };

  return (
    <Card className="overflow-hidden border-none bg-card/50 backdrop-blur-md shadow-lg hover:shadow-xl transition-all duration-300 ease-smooth hover:-translate-y-1 animate-fade-up fill-mode-both">
      <CardHeader className="p-4 lg:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href={`/users/${author.username}`} className="hover:opacity-80 transition-opacity active:scale-95 duration-150">
              <UserAvatar user={author} size="sm" />
            </Link>
            <div className="min-w-0">
              <Link href={`/posts/${post.id}`} className="group">
                <CardTitle className="text-base lg:text-lg truncate group-hover:text-primary transition-colors">{post.title}</CardTitle>
              </Link>
              <div className="flex items-center gap-1">
                <Link
                  href={`/users/${author.username}`}
                  className="hover:text-primary transition-colors text-xs lg:text-sm text-muted-foreground"
                >
                  {author.username}
                </Link>
                {author.verified && <BadgeCheck className="h-4 w-4 text-primary animate-fade-scale" />}
                <span className="text-xs lg:text-sm text-muted-foreground tabular-nums">
                  {" • "}
                  {post.createdAt ? format(new Date(post.createdAt), "PPP") : ""}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-primary text-xs lg:text-sm animate-fade-scale">
              {post.category}
            </Badge>
            {author.id !== user?.id && (
              <Button
                variant={author.isFollowing ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  if (author.isFollowing) {
                    unfollowMutation.mutate(author.id);
                  } else {
                    followMutation.mutate(author.id);
                  }
                }}
                disabled={followMutation.isPending || unfollowMutation.isPending}
                className="text-xs lg:text-sm h-9 px-4 active:scale-90 hover:scale-105 transition-all duration-200 ease-spring"
              >
                {author.isFollowing ? t("feed.following") : t("feed.follow")}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 lg:p-6">
        <p className="text-sm lg:text-base whitespace-pre-wrap mb-4 leading-relaxed">{post.content}</p>

        {post.mediaUrl && !imageLoadError && (
          <div className="mt-4 rounded-xl overflow-hidden bg-muted/20 relative group aspect-video lg:aspect-auto min-h-[200px] max-h-[600px]">
            {/* SMOOTH-FIX: Layout Shift Prevention with Skeleton Placeholder */}
            {!imageLoadError && (
              <div className="absolute inset-0 bg-muted/10 animate-pulse group-data-[loading=false]:hidden" />
            )}
            
            {post.mediaType === "image" ? (
              <img
                src={`/uploads/${post.mediaUrl}`}
                alt={post.title || "Post image"}
                className="w-full h-full object-cover rounded-xl transition-transform duration-500 group-hover:scale-[1.02]"
                onLoad={(e) => (e.currentTarget.parentElement!.dataset.loading = "false")}
                onError={() => setImageLoadError(true)}
                loading="lazy"
              />
            ) : post.mediaType === "video" ? (
              <video
                src={`/uploads/${post.mediaUrl}`}
                controls
                className="w-full h-full rounded-xl transition-transform duration-500 group-hover:scale-[1.02]"
                onLoadedData={(e) => (e.currentTarget.parentElement!.dataset.loading = "false")}
                onError={() => setImageLoadError(true)}
              />
            ) : null}
          </div>
        )}

        {imageLoadError && (
          <div className="mt-4 p-8 rounded-xl bg-muted/10 flex flex-col items-center justify-center gap-2 text-muted-foreground animate-fade-scale">
            <ImageOff className="h-8 w-8 opacity-20" />
            <span className="text-xs">{t("media_feed.load_error")}</span>
          </div>
        )}

        {/* Comments Section */}
        <div className="mt-8 space-y-4 border-t pt-6 border-border/50">
          <h3 className="text-sm lg:text-base font-semibold flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" />
            {t("comments.title")}
          </h3>

          <div className="flex gap-2">
            <Input
              data-post-id={post.id}
              placeholder={t("comments.placeholder")}
              className="text-sm h-10 transition-all focus:ring-primary/20"
              aria-label={t("comments.placeholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) {
                  createCommentMutation.mutate({
                    postId: post.id,
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
                const input = document.querySelector(
                  `input[data-post-id="${post.id}"]`,
                ) as HTMLInputElement;
                if (input?.value?.trim()) {
                  createCommentMutation.mutate({
                    postId: post.id,
                    content: input.value.trim(),
                  });
                  input.value = "";
                }
              }}
              className="h-10 active:scale-95 transition-transform"
            >
              {t("comments.post_button")}
            </Button>
          </div>

          <div className="space-y-3">
            {comments.map((comment, idx) => (
              <div 
                key={comment.id} 
                className="bg-muted/30 hover:bg-muted/50 transition-colors rounded-xl p-3 animate-fade-up"
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Link href={`/users/${comment.author.username}`} className="hover:opacity-80 transition-opacity active:scale-95">
                      <UserAvatar user={comment.author} size="sm" />
                    </Link>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <Link
                          href={`/users/${comment.author.username}`}
                          className="text-xs lg:text-sm font-medium hover:text-primary transition-colors truncate"
                        >
                          {comment.author.username}
                        </Link>
                        {comment.author.verified && (
                          <BadgeCheck className="h-4 w-4 text-primary animate-fade-scale" />
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground block tabular-nums">
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
                      className="h-8 px-2 hover:bg-primary/10 hover:text-primary active:scale-90 transition-all ease-spring"
                      aria-label={t("actions.like")}
                    >
                      <Heart
                        className={cn(
                          "h-3.5 w-3.5 mr-1 transition-all",
                          comment.isLiked && "fill-current scale-110",
                        )}
                      />
                      <span className="text-[10px] tabular-nums">{comment.likes}</span>
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
                              className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive active:scale-90 transition-all"
                              aria-label={t("actions.delete")}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="animate-fade-scale">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-xl font-bold">{t("actions.delete")}</AlertDialogTitle>
                              <AlertDialogDescription className="text-base text-muted-foreground">
                                {t("actions.delete_comment_confirm")}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="gap-2">
                              <AlertDialogCancel className="h-11 rounded-xl transition-all active:scale-95">{t("actions.cancel")}</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() =>
                                  deleteCommentMutation.mutate({
                                    postId: post.id,
                                    commentId: comment.id,
                                  })
                                }
                                className="h-11 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-all active:scale-95"
                              >
                                {t("actions.delete")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                  </div>
                </div>
                <p className="text-xs lg:text-sm mt-3 pl-10 text-muted-foreground/90 leading-relaxed">{comment.content}</p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>

      <CardFooter className="p-4 lg:p-6 border-t border-border/50 bg-muted/5 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center space-x-1 sm:space-x-3">
          <Button
            variant={post.userReaction?.isLike ? "default" : "ghost"}
            size="sm"
            onClick={() => reactionMutation.mutate({ postId: post.id, isLike: true })}
            disabled={reactionMutation.isPending}
            className="h-10 px-3 hover:bg-primary/10 hover:text-primary hover:scale-105 active:scale-90 transition-all ease-spring group"
            aria-label={t("actions.like")}
          >
            <ThumbsUp
              className={cn(
                "h-4 w-4 mr-1.5 transition-all",
                post.userReaction?.isLike && "fill-current scale-110 animate-like-bounce",
                !post.userReaction?.isLike && "group-hover:translate-y-[-2px]"
              )}
            />
            <span className="text-xs lg:text-sm font-medium tabular-nums">{reactions.likes}</span>
          </Button>
          <Button
            variant={post.userReaction?.isLike === false ? "default" : "ghost"}
            size="sm"
            onClick={() => reactionMutation.mutate({ postId: post.id, isLike: false })}
            disabled={reactionMutation.isPending}
            className="h-10 px-3 hover:bg-destructive/10 hover:text-destructive hover:scale-105 active:scale-90 transition-all ease-spring group"
            aria-label={t("actions.dislike")}
          >
            <ThumbsDown
              className={cn(
                "h-4 w-4 mr-1.5 transition-all text-muted-foreground group-hover:text-destructive",
                post.userReaction?.isLike === false && "fill-current scale-110 text-destructive-foreground",
                post.userReaction?.isLike !== false && "group-hover:translate-y-[2px]"
              )}
            />
            <span className="text-xs lg:text-sm font-medium tabular-nums">{reactions.dislikes}</span>
          </Button>
        </div>

        <div className="flex items-center space-x-2">
          {(user?.role === "owner" ||
            (user?.role === "admin" && author.role !== "owner") ||
            author.id === user?.id) && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={deletePostMutation.isPending}
                    className="h-10 px-4 hover:bg-destructive/10 hover:text-destructive active:scale-95 transition-all flex items-center gap-2"
                    aria-label={t("actions.delete")}
                  >
                    {deletePostMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4" />
                        <span className="text-xs lg:text-sm font-medium">{t("actions.delete")}</span>
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="animate-fade-scale">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-xl font-bold">{t("actions.delete")}</AlertDialogTitle>
                    <AlertDialogDescription className="text-base text-muted-foreground">
                      {t("actions.delete_post_confirm")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="gap-2">
                    <AlertDialogCancel className="h-11 rounded-xl transition-all active:scale-95">{t("actions.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deletePostMutation.mutate(post.id)}
                      className="h-11 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-all active:scale-95"
                    >
                      {t("actions.delete")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          <ReportDialog type={reportType} id={post.id} />
        </div>
      </CardFooter>
    </Card>
  );
}
