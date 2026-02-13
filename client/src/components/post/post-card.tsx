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
    <Card className="overflow-hidden">
      <CardHeader className="p-4 lg:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href={`/users/${author.username}`} className="hover:opacity-80">
              <UserAvatar user={author} size="sm" />
            </Link>
            <div className="min-w-0">
              <Link href={`/posts/${post.id}`} className="hover:underline">
                <CardTitle className="text-base lg:text-lg truncate">{post.title}</CardTitle>
              </Link>
              <div className="flex items-center gap-1">
                <Link
                  href={`/users/${author.username}`}
                  className="hover:underline text-xs lg:text-sm text-muted-foreground"
                >
                  {author.username}
                </Link>
                {author.verified && <BadgeCheck className="h-4 w-4 text-blue-500" />}
                <span className="text-xs lg:text-sm text-muted-foreground">
                  {" • "}
                  {post.createdAt ? format(new Date(post.createdAt), "PPP") : ""}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-primary text-xs lg:text-sm">
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
                className="text-xs lg:text-sm"
              >
                {author.isFollowing ? t("feed.following") : t("feed.follow")}
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
            <span>{t("media_feed.load_error")}</span>
          </div>
        )}

        {/* Comments Section */}
        <div className="mt-6 space-y-4">
          <h3 className="text-sm lg:text-base font-semibold flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            {t("comments.title")}
          </h3>

          <div className="flex gap-2">
            <Input
              data-post-id={post.id}
              placeholder={t("comments.placeholder")}
              className="text-sm"
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
            >
              {t("comments.post_button")}
            </Button>
          </div>

          <div className="space-y-3">
            {comments.map((comment) => (
              <div key={comment.id} className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Link href={`/users/${comment.author.username}`} className="hover:opacity-80">
                      <UserAvatar user={comment.author} size="sm" />
                    </Link>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <Link
                          href={`/users/${comment.author.username}`}
                          className="text-xs lg:text-sm font-medium hover:underline truncate"
                        >
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
                      <Heart
                        className={`h-4 w-4 mr-1 ${comment.isLiked ? "fill-current" : ""}`}
                      />
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
                              <AlertDialogTitle>{t("actions.delete")}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("actions.delete_comment_confirm")}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() =>
                                  deleteCommentMutation.mutate({
                                    postId: post.id,
                                    commentId: comment.id,
                                  })
                                }
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                {t("actions.delete")}
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
            variant={post.userReaction?.isLike ? "default" : "ghost"}
            size="sm"
            onClick={() => reactionMutation.mutate({ postId: post.id, isLike: true })}
            disabled={reactionMutation.isPending}
            className="h-8"
          >
            <ThumbsUp
              className={`h-4 w-4 mr-1 ${post.userReaction?.isLike ? "fill-current" : ""}`}
            />
            <span className="text-xs lg:text-sm">{reactions.likes}</span>
          </Button>
          <Button
            variant={post.userReaction?.isLike === false ? "default" : "ghost"}
            size="sm"
            onClick={() => reactionMutation.mutate({ postId: post.id, isLike: false })}
            disabled={reactionMutation.isPending}
            className="h-8"
          >
            <ThumbsDown
              className={`h-4 w-4 mr-1 ${post.userReaction?.isLike === false ? "fill-current" : ""}`}
            />
            <span className="text-xs lg:text-sm">{reactions.dislikes}</span>
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
                    className="h-8"
                  >
                    {deletePostMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-1" />
                        <span className="text-xs lg:text-sm">{t("actions.delete")}</span>
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("actions.delete")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("actions.delete_post_confirm")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deletePostMutation.mutate(post.id)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
