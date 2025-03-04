import { useState } from "react";
import { Navbar } from "@/components/layout/navbar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Post, Report, insertDiscussionPostSchema, insertCommentSchema } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ThumbsUp, ThumbsDown, Flag, Loader2, MessageCircle, UserCircle, Trash2, Heart } from "lucide-react";
import { format } from "date-fns";
import * as z from 'zod';
import { UserAvatar } from "@/components/ui/user-avatar";

type PostWithAuthor = Post & {
  author: { username: string; id: number; role: string };
  comments: Array<{
    id: number;
    content: string;
    author: { username: string; role: string; id: number };
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

export default function DiscussionsPage() {
  const { toast } = useToast();
  const { user } = useAuth();

  // Query for discussion posts with author and comments
  const { data: posts, isLoading } = useQuery<PostWithAuthor[]>({
    queryKey: ["/api/posts", "discussion"],
    queryFn: async () => {
      const res = await fetch("/api/posts?category=discussion");
      if (!res.ok) throw new Error("Failed to fetch posts");
      return res.json();
    },
  });

  type FormData = z.infer<typeof insertDiscussionPostSchema>;
  const form = useForm<FormData>({
    resolver: zodResolver(insertDiscussionPostSchema),
    defaultValues: {
      title: "",
      content: "",
      category: "discussion",
    },
  });

  const createPostMutation = useMutation<Post, Error, FormData>({
    mutationFn: async (data) => {
      const res = await apiRequest("POST", "/api/posts", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts", "discussion"] });
      form.reset();
      toast({
        title: "Post created",
        description: "Your discussion has been posted successfully.",
      });
    },
  });

  const createCommentMutation = useMutation({
    mutationFn: async ({ postId, content }: { postId: number; content: string }) => {
      const res = await apiRequest("POST", "/api/comments", { postId, content });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts", "discussion"] });
      toast({
        title: "Comment added",
        description: "Your comment has been posted successfully.",
      });
    },
  });

  const reportMutation = useMutation<Report, Error, { discussionId: number; reason: string }>({
    mutationFn: async ({ discussionId, reason }) => {
      const res = await apiRequest("POST", "/api/reports", { discussionId, reason });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Report submitted",
        description: "Thank you for helping keep our community safe.",
      });
    },
  });

  const reactionMutation = useMutation<Post, Error, { postId: number; isLike: boolean }>({
    mutationFn: async ({ postId, isLike }) => {
      const res = await apiRequest("POST", `/api/posts/${postId}/react`, { isLike });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts", "discussion"] });
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: async (postId: number) => {
      const res = await apiRequest("DELETE", `/api/posts/${postId}`);
      if (!res.ok) {
        throw new Error("Failed to delete post");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts", "discussion"] });
      toast({ title: "Post deleted", description: "The discussion has been deleted." });
    }
  });


  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: number) => {
      const res = await apiRequest("DELETE", `/api/comments/${commentId}`);
      if (!res.ok) {
        throw new Error("Failed to delete comment");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts", "discussion"] });
      toast({ title: "Comment deleted", description: "The comment has been deleted." });
    }
  });

  const likeCommentMutation = useMutation({
    mutationFn: async (commentId: number) => {
      const res = await apiRequest("POST", `/api/comments/${commentId}/like`);
      if (!res.ok) {
        throw new Error("Failed to like comment");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts", "discussion"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 pt-24">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl font-bold mb-8">Discussions</h1>

          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Start a Discussion</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit((data) => createPostMutation.mutate(data))}
                  className="space-y-4"
                >
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="content"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Content</FormLabel>
                        <FormControl>
                          <Textarea rows={4} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    disabled={createPostMutation.isPending}
                    className="w-full"
                  >
                    {createPostMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Post Discussion"
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : posts?.length === 0 ? (
            <Alert>
              <AlertDescription>
                No discussions yet. Be the first to start one!
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-6">
              {posts?.map((post) => (
                <Card key={post.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Link href={`/users/${post.author.username}`} className="hover:opacity-80">
                          <UserAvatar user={post.author} size="sm" />
                        </Link>
                        <div>
                          <CardTitle>{post.title}</CardTitle>
                          <Link href={`/users/${post.author.username}`} className="text-sm text-muted-foreground hover:underline">
                            {post.author.username}
                          </Link>
                        </div>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Posted on {format(new Date(post.createdAt), "PPP")}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap mb-4">{post.content}</p>

                    {/* Comments Section */}
                    <div className="mt-6 space-y-4">
                      <h3 className="font-semibold flex items-center gap-2">
                        <MessageCircle className="h-4 w-4" />
                        Comments
                      </h3>

                      {/* Comments List */}
                      <div className="space-y-3">
                        {post.comments?.map((comment) => (
                          <div key={comment.id} className="bg-muted/50 rounded-lg p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Link href={`/users/${comment.author.username}`} className="hover:opacity-80">
                                  <UserAvatar user={comment.author} size="sm" />
                                </Link>
                                <div>
                                  <Link href={`/users/${comment.author.username}`} className="text-sm font-medium hover:underline">
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
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      if (window.confirm("Are you sure you want to delete this comment?")) {
                                        deleteCommentMutation.mutate(comment.id);
                                      }
                                    }}
                                    disabled={deleteCommentMutation.isPending}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                            <p className="text-sm mt-2 pl-10">{comment.content}</p>
                          </div>
                        ))}
                      </div>

                      {/* Comment input form */}
                      <div className="flex gap-2">
                        <Input
                          placeholder="Write a comment..."
                          onKeyPress={(e) => {
                            if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                              createCommentMutation.mutate({
                                postId: post.id,
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
                            const input = (document.activeElement as HTMLInputElement);
                            if (input?.value?.trim()) {
                              createCommentMutation.mutate({
                                postId: post.id,
                                content: input.value.trim()
                              });
                              input.value = '';
                            }
                          }}
                        >
                          Post
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="flex justify-between">
                    <div className="flex items-center space-x-4">
                      <Button
                        variant={post.userReaction?.isLike ? "default" : "ghost"}
                        size="sm"
                        onClick={() => reactionMutation.mutate({ postId: post.id, isLike: true })}
                      >
                        <ThumbsUp className={`h-4 w-4 mr-1 ${post.userReaction?.isLike ? "fill-current" : ""}`} />
                        <span>{post.reactions.likes}</span>
                      </Button>
                      <Button
                        variant={post.userReaction?.isLike === false ? "default" : "ghost"}
                        size="sm"
                        onClick={() => reactionMutation.mutate({ postId: post.id, isLike: false })}
                      >
                        <ThumbsDown className={`h-4 w-4 mr-1 ${post.userReaction?.isLike === false ? "fill-current" : ""}`} />
                        <span>{post.reactions.dislikes}</span>
                      </Button>
                    </div>
                    <div>
                      {(user?.role === 'owner' ||
                        (user?.role === 'admin' && post.author.role !== 'owner') ||
                        post.author.id === user?.id) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (window.confirm("Are you sure you want to delete this discussion?")) {
                              deletePostMutation.mutate(post.id);
                            }
                          }}
                          disabled={deletePostMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      )}
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <Flag className="h-4 w-4 mr-1" />
                          Report
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Report Discussion</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to report this discussion? This will notify moderators to review the content.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => {
                              reportMutation.mutate({
                                discussionId: post.id,
                                reason: "Inappropriate content"
                              });
                            }}
                          >
                            Report
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
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