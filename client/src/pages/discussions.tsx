import { Navbar } from "@/components/layout/navbar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Post, insertDiscussionPostSchema, insertCommentSchema } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
import { ThumbsUp, ThumbsDown, Flag, Loader2, MessageCircle, UserCircle } from "lucide-react";
import { format } from "date-fns";
import * as z from 'zod';
import { Report } from "@shared/schema";

type PostWithAuthor = Post & {
  author: { username: string };
  comments: Array<{
    id: number;
    content: string;
    author: { username: string };
    createdAt: string;
  }>;
};

export default function DiscussionsPage() {
  const { toast } = useToast();
  const { user } = useAuth();

  // Query for discussion posts with author and comments
  const { data: posts, isLoading } = useQuery<PostWithAuthor[]>({
    queryKey: ["/api/posts", "discussion"],
    queryFn: async () => {
      const res = await fetch("/api/posts?category=discussion&include=author,comments");
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
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ postId, content })
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "Failed to post comment");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts", "discussion"] });
      toast({
        title: "Comment added",
        description: "Your comment has been posted successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error posting comment",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const karmaUpdateMutation = useMutation<Post, Error, { postId: number; karma: number }>({
    mutationFn: async ({ postId, karma }) => {
      const res = await apiRequest("POST", `/api/posts/${postId}/karma`, { karma });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts", "discussion"] });
    },
  });

  const reportMutation = useMutation<Report, Error, { postId: number; reason: string }>({
    mutationFn: async ({ postId, reason }) => {
      const res = await apiRequest("POST", "/api/reports", { postId, reason });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Report submitted",
        description: "Thank you for helping keep our community safe.",
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
                      <div>
                        <CardTitle>{post.title}</CardTitle>
                        <div className="flex items-center space-x-2 mt-2 text-sm text-muted-foreground">
                          <UserCircle className="h-4 w-4" />
                          <span>{post.author.username}</span>
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

                      {/* Comment Form */}
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

                      {/* Comments List */}
                      <div className="space-y-3">
                        {post.comments?.map((comment) => (
                          <div key={comment.id} className="bg-muted/50 rounded-lg p-3">
                            <div className="flex items-center space-x-2 mb-1">
                              <UserCircle className="h-4 w-4" />
                              <span className="text-sm font-medium">{comment.author.username}</span>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(comment.createdAt), "PPp")}
                              </span>
                            </div>
                            <p className="text-sm">{comment.content}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="flex justify-between">
                    <div className="flex items-center space-x-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          karmaUpdateMutation.mutate({
                            postId: post.id,
                            karma: post.karma + 1,
                          })
                        }
                      >
                        <ThumbsUp className="h-4 w-4 mr-1" />
                        <span>{post.karma}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          karmaUpdateMutation.mutate({
                            postId: post.id,
                            karma: post.karma - 1,
                          })
                        }
                      >
                        <ThumbsDown className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        reportMutation.mutate({
                          postId: post.id,
                          reason: "Inappropriate content",
                        })
                      }
                    >
                      <Flag className="h-4 w-4 mr-1" />
                      Report
                    </Button>
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