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
import { Report } from "@shared/schema";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Input } from "@/components/ui/input";

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
  reactions: {
    likes: number;
    dislikes: number;
  };
  userReaction: {
    isLike: boolean;
  } | null;
};

export default function MediaFeedPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [imageLoadErrors, setImageLoadErrors] = useState<Record<string, boolean>>({});

  const { data: posts, isLoading, error } = useQuery<PostWithAuthor[]>({
    queryKey: ["/api/posts", "media"],
    queryFn: async () => {
      console.log("Fetching media posts...");
      const res = await fetch("/api/posts?category=news,entertainment&include=author,comments,reactions,userReaction");
      if (!res.ok) {
        const errorText = await res.text();
        console.error("Failed to fetch posts:", errorText);
        throw new Error(errorText || "Failed to fetch posts");
      }
      const data = await res.json();
      console.log("Fetched posts:", data);
      return data;
    },
    refetchInterval: 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

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
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
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
    mutationFn: async ({ postId, content }: { postId: number; content: string }) => {
      const res = await apiRequest("POST", "/api/comments", { postId, content });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      toast({
        title: "Success",
        description: "Comment added successfully",
      });
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
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
    },
  });

  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 pt-24">
        <div className="max-w-3xl mx-auto">
          <div className="lg:hidden mb-6">
            <h1 className="text-2xl font-bold mb-4">{t('feed.media_title')}</h1>
            <div className="flex gap-2 overflow-x-auto pb-2">
              <Button asChild size="sm" className="whitespace-nowrap">
                <Link href="/post/news">
                  <Plus className="h-4 w-4 mr-1" />
                  {t('feed.post_news')}
                </Link>
              </Button>
              <Button asChild size="sm" className="whitespace-nowrap">
                <Link href="/post/entertainment">
                  <Plus className="h-4 w-4 mr-1" />
                  {t('feed.post_entertainment')}
                </Link>
              </Button>
            </div>
          </div>

          <div className="hidden lg:flex items-center justify-between mb-8">
            <h1 className="text-4xl font-bold">{t('feed.media_title')}</h1>
            <div className="space-x-4">
              <Button asChild>
                <Link href="/post/news">{t('feed.post_news')}</Link>
              </Button>
              <Button asChild>
                <Link href="/post/entertainment">{t('feed.post_entertainment')}</Link>
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertDescription>Error fetching posts: {error.message}</AlertDescription>
            </Alert>
          ) : posts?.length === 0 ? (
            <Alert>
              <AlertDescription>
                {t('feed.no_posts')}
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4 lg:space-y-6">
              {posts?.map((post) => (
                <Card key={post.id} className="overflow-hidden">
                  <CardHeader className="p-4 lg:p-6">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <Link href={`/users/${post.author.username}`} className="hover:opacity-80">
                          <UserAvatar user={post.author} size="sm" />
                        </Link>
                        <div className="min-w-0">
                          <Link href={`/posts/${post.id}`} className="hover:underline">
                            <CardTitle className="text-base lg:text-lg truncate">{post.title}</CardTitle>
                          </Link>
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

                    {post.mediaUrl && !imageLoadErrors[post.id] && (
                      <div className="mt-4 rounded-lg overflow-hidden bg-muted/10">
                        {post.mediaType === "image" ? (
                          <div className="flex items-center justify-center min-h-[200px] max-h-[500px] bg-muted/5">
                            <img
                              src={`/uploads/${post.mediaUrl}`}
                              alt={post.title || "Post image"}
                              className="max-w-full h-auto max-h-[500px] rounded-lg"
                              onError={(e) => {
                                console.error('Image failed to load:', post.mediaUrl);
                                const target = e.target as HTMLImageElement;
                                console.error('Failed URL:', target.src);
                                setImageLoadErrors((prev) => ({ ...prev, [post.id]: true }));
                              }}
                              loading="lazy"
                            />
                          </div>
                        ) : post.mediaType === "video" ? (
                          <div className="flex items-center justify-center min-h-[200px] max-h-[500px] bg-muted/5">
                            <video
                              src={`/uploads/${post.mediaUrl}`}
                              controls
                              className="max-w-full max-h-[500px] rounded-lg"
                              onError={(e) => {
                                console.error('Video failed to load:', post.mediaUrl);
                                const target = e.target as HTMLVideoElement;
                                console.error('Failed URL:', target.src);
                                setImageLoadErrors((prev) => ({ ...prev, [post.id]: true }));
                              }}
                            />
                          </div>
                        ) : null}
                      </div>
                    )}

                    {imageLoadErrors[post.id] && (
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
                          data-post-id={post.id}
                          placeholder={t('comments.placeholder')}
                          className="text-sm"
                          onKeyPress={(e) => {
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
                            const input = document.querySelector(`input[data-post-id="${post.id}"]`) as HTMLInputElement;
                            if (input?.value?.trim()) {
                              createCommentMutation.mutate({
                                postId: post.id,
                                content: input.value.trim(),
                              });
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
                                            onClick={() => deleteCommentMutation.mutate({ postId: post.id, commentId: comment.id })}
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
                        variant={post.userReaction?.isLike ? "default" : "ghost"}
                        size="sm"
                        onClick={() => reactionMutation.mutate({ postId: post.id, isLike: true })}
                        disabled={reactionMutation.isPending}
                        className="h-8"
                      >
                        <ThumbsUp className={`h-4 w-4 mr-1 ${post.userReaction?.isLike ? "fill-current" : ""}`} />
                        <span className="text-xs lg:text-sm">{post.reactions.likes}</span>
                      </Button>
                      <Button
                        variant={post.userReaction?.isLike === false ? "default" : "ghost"}
                        size="sm"
                        onClick={() => reactionMutation.mutate({ postId: post.id, isLike: false })}
                        disabled={reactionMutation.isPending}
                        className="h-8"
                      >
                        <ThumbsDown className={`h-4 w-4 mr-1 ${post.userReaction?.isLike === false ? "fill-current" : ""}`} />
                        <span className="text-xs lg:text-sm">{post.reactions.dislikes}</span>
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
                                  onClick={() => deletePostMutation.mutate(post.id)}
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
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}