import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
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
import { ThumbsUp, ThumbsDown, Flag, Loader2, MessageCircle, Trash2, Plus, Heart, BadgeCheck, ImageOff } from "lucide-react";
import { ReportDialog } from "@/components/dialogs/report-dialog";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Input } from "@/components/ui/input";

type DiscussionWithAuthor = Post & {
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
  reactions: {
    likes: number;
    dislikes: number;
  };
  userReaction: {
    isLike: boolean;
  } | null;
};

export default function DiscussionsFeedPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: discussions, isLoading } = useQuery<DiscussionWithAuthor[]>({
    queryKey: ["/api/posts", "discussion"],
    queryFn: async () => {
      const res = await fetch("/api/posts?category=discussion");
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "Failed to fetch discussions");
      }
      return res.json();
    },
  });

  const reactionMutation = useMutation<Post, Error, { discussionId: number; isLike: boolean }>({
    mutationFn: async ({ discussionId, isLike }) => {
      const res = await apiRequest("POST", `/api/discussions/${discussionId}/react`, { isLike });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts", "discussion"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/posts", "discussion"] });
      queryClient.invalidateQueries({ queryKey: ["/api/following"] });
      toast({
        title: "Success",
        description: "User followed successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
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
      queryClient.invalidateQueries({ queryKey: ["/api/posts", "discussion"] });
      queryClient.invalidateQueries({ queryKey: ["/api/following"] });
      toast({
        title: "Success",
        description: "User unfollowed successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createCommentMutation = useMutation({
    mutationFn: async ({ discussionId, content }: { discussionId: number; content: string }) => {
      // API expects postId, so we pass discussionId as postId
      const res = await apiRequest("POST", "/api/comments", { postId: discussionId, content });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts", "discussion"] });
      toast({
        title: "Success",
        description: "Comment added successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: async (discussionId: number) => {
      const res = await apiRequest("DELETE", `/api/discussions/${discussionId}`);
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts", "discussion"] });
      toast({
        title: "Success",
        description: "Post deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async ({ postId, commentId }: { postId: number; commentId: number }) => {
      const res = await apiRequest("DELETE", `/api/comments/${commentId}`);
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts", "discussion"] });
      toast({
        title: "Success",
        description: "Comment deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const likeCommentMutation = useMutation({
    mutationFn: async (commentId: number) => {
      const res = await apiRequest("POST", `/api/comments/${commentId}/like`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts", "discussion"] });
    },
  });

  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 pt-24">
        <div className="max-w-3xl mx-auto">
          <div className="lg:hidden mb-6">
            <h1 className="text-2xl font-bold mb-4">{t('feed.discussions_title')}</h1>
            <Button asChild size="sm" className="whitespace-nowrap">
              <Link href="/post/discussion">
                {t('feed.create_discussion')}
              </Link>
            </Button>
          </div>

          <div className="hidden lg:flex items-center justify-between mb-8">
            <h1 className="text-4xl font-bold">{t('feed.discussions_title')}</h1>
            <Button asChild>
              <Link href="/post/discussion">{t('feed.create_discussion')}</Link>
            </Button>
          </div>

          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : discussions?.length === 0 ? (
            <Alert>
              <AlertDescription>
                {t('feed.no_discussions')}
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4 lg:space-y-6">
              {discussions?.map((post) => (
                <Card key={post.id} className="overflow-hidden">
                  <CardHeader className="p-4 lg:p-6">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <Link href={`/users/${post.author.username}`} className="hover:opacity-80">
                          <UserAvatar user={post.author} size="sm" />
                        </Link>
                        <div className="min-w-0">
                          <CardTitle className="text-base lg:text-lg truncate">{post.title}</CardTitle>
                          <p className="text-xs lg:text-sm text-muted-foreground">
                            <Link href={`/users/${post.author.username}`} className="hover:underline">
                              {post.author.username}
                            </Link>
                            {" • "}
                            {format(new Date(post.createdAt), "PPP")}
                          </p>
                        </div>
                      </div>
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
                  </CardHeader>
                  <CardContent className="p-4 lg:p-6">
                    <p className="text-sm lg:text-base whitespace-pre-wrap mb-4">{post.content}</p>

                    <div className="mt-6 space-y-4">
                      <h3 className="text-sm lg:text-base font-semibold flex items-center gap-2">
                        <MessageCircle className="h-4 w-4" />
                        {t('comments.title')}
                      </h3>

                      <div className="flex gap-2">
                        <Input
                          data-discussion-id={post.id}
                          placeholder={t('comments.placeholder')}
                          className="text-sm"
                          onKeyPress={(e) => {
                            if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                              createCommentMutation.mutate({
                                discussionId: post.id,
                                content: (e.target as HTMLInputElement).value.trim()
                              });
                              (e.target as HTMLInputElement).value = '';
                            }
                          }}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const input = document.querySelector(`input[data-discussion-id="${post.id}"]`) as HTMLInputElement;
                            if (input?.value?.trim()) {
                              createCommentMutation.mutate({
                                discussionId: post.id,
                                content: input.value.trim()
                              });
                              input.value = '';
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
                                <div className="min-w-0">
                                  <Link href={`/users/${comment.author.username}`} className="text-xs lg:text-sm font-medium block truncate hover:underline">
                                    {comment.author.username}
                                  </Link>
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
                                  user?.role === 'owner' ||
                                  (user?.role === 'admin' && comment.author.role !== 'owner')) && (
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
                                          <AlertDialogTitle>{t('actions.delete')}</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            {t('actions.delete_comment_confirm')}
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
                                          <AlertDialogAction
                                            onClick={() => deleteCommentMutation.mutate({ postId: post.id, commentId: comment.id })}
                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                          >
                                            {t('actions.delete')}
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
                        onClick={() => reactionMutation.mutate({ discussionId: post.id, isLike: true })}
                        className="h-8"
                      >
                        <ThumbsUp className={`h-4 w-4 mr-1 ${post.userReaction?.isLike ? "fill-current" : ""}`} />
                        <span className="text-xs lg:text-sm">{post.reactions.likes}</span>
                      </Button>
                      <Button
                        variant={post.userReaction?.isLike === false ? "default" : "ghost"}
                        size="sm"
                        onClick={() => reactionMutation.mutate({ discussionId: post.id, isLike: false })}
                        className="h-8"
                      >
                        <ThumbsDown className={`h-4 w-4 mr-1 ${post.userReaction?.isLike === false ? "fill-current" : ""}`} />
                        <span className="text-xs lg:text-sm">{post.reactions.dislikes}</span>
                      </Button>
                    </div>

                    <div className="flex items-center space-x-2">
                      {(user?.role === 'owner' ||
                        (user?.role === 'admin' && post.author.role !== 'owner') ||
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
                                <AlertDialogTitle>{t('actions.delete')}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t('actions.delete_post_confirm')}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deletePostMutation.mutate(post.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  {t('actions.delete')}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      <ReportDialog type="discussion" id={post.id} />
                    </div>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}