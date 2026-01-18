import { Navbar } from "@/components/layout/navbar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Post, insertMediaPostSchema, insertCommentSchema } from "@shared/schema";
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
import { Badge } from "@/components/ui/badge";
import { ThumbsUp, ThumbsDown, Flag, Loader2, Coffee, SmilePlus, MessageCircle, UserCircle } from "lucide-react";
import { format } from "date-fns";
import { ReportDialog } from "@/components/dialogs/report-dialog";
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
  reactions: {
    likes: number;
    dislikes: number;
  };
  userReaction: {
    isLike: boolean;
  } | null;
};

export default function EntertainmentPage() {
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: posts, isLoading } = useQuery<PostWithAuthor[]>({
    queryKey: ["/api/posts", "entertainment"],
    queryFn: async () => {
      const res = await fetch("/api/posts?category=entertainment");
      if (!res.ok) throw new Error("Failed to fetch posts");
      return res.json();
    },
    refetchInterval: 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  const form = useForm<z.infer<typeof insertMediaPostSchema>>({
    resolver: zodResolver(insertMediaPostSchema),
    defaultValues: {
      title: "",
      content: "",
      category: "entertainment",
    },
  });

  const createPostMutation = useMutation({
    mutationFn: async (data: FormData) => {
      console.log("Submitting form data:", {
        title: data.get('title'),
        content: data.get('content'),
        mediaFile: data.get('mediaFile')
      });

      const res = await fetch("/api/posts", {
        method: "POST",
        body: data,
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Failed to create post:", errorText);
        throw new Error(errorText || "Failed to create post");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      form.reset();
      toast({
        title: "Success",
        description: "Your entertainment post has been shared.",
      });
    },
    onError: (error: Error) => {
      console.error("Post creation error:", error);
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
        title: "Comment added",
        description: "Your comment has been posted successfully.",
      });
    },
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



  const onSubmit = async (data: z.infer<typeof insertMediaPostSchema>) => {
    try {
      const formData = new FormData();
      formData.append("title", data.title);
      formData.append("content", data.content);
      formData.append("category", data.category);

      const mediaFile = form.getValues("mediaFile");
      if (mediaFile?.[0]) {
        console.log("Appending media file:", mediaFile[0]);
        formData.append("mediaFile", mediaFile[0]);
      }

      await createPostMutation.mutateAsync(formData);
    } catch (error) {
      console.error("Error in form submission:", error);
    }
  };

  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 pt-24">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center space-x-4 mb-8">
            <h1 className="text-4xl font-bold">Entertainment</h1>
            <Coffee className="h-8 w-8 text-primary" />
          </div>

          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <SmilePlus className="h-5 w-5" />
                <span>Share Something Fun</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-4"
                  encType="multipart/form-data"
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
                          <Textarea
                            rows={4}
                            placeholder="Share a joke, a funny story, or something interesting!"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="mediaFile"
                    render={({ field: { onChange, value, ...field } }) => (
                      <FormItem>
                        <FormLabel>Media (Image or Video)</FormLabel>
                        <FormControl>
                          <Input
                            type="file"
                            accept="image/*,video/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                console.log("Selected file:", file);
                                onChange(e.target.files);
                              }
                            }}
                            {...field}
                          />
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
                      "Share"
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
                No entertainment posts yet. Share something fun to get started!
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
                      <Badge variant="outline" className="text-primary">
                        Fun
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Shared on {format(new Date(post.createdAt), "PPP")}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap mb-4">{post.content}</p>
                    {post.mediaUrl && (
                      <div className="mt-4 rounded-lg overflow-hidden bg-gray-100">
                        {post.mediaType === 'image' ? (
                          <img
                            src={`/uploads/${post.mediaUrl}`}
                            alt="Entertainment content"
                            className="w-full h-auto max-h-[500px] object-contain"
                            onError={(e) => {
                              console.error("Failed to load image:", e);
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : post.mediaType === 'video' ? (
                          <video
                            src={`/uploads/${post.mediaUrl}`}
                            controls
                            className="w-full max-h-[500px]"
                            onError={(e) => {
                              console.error("Failed to load video:", e);
                              (e.target as HTMLVideoElement).style.display = 'none';
                            }}
                          />
                        ) : null}
                      </div>
                    )}

                    <div className="mt-6 space-y-4">
                      <h3 className="font-semibold flex items-center gap-2">
                        <MessageCircle className="h-4 w-4" />
                        Comments
                      </h3>

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
                        variant={post.userReaction?.isLike ? "default" : "ghost"}
                        size="sm"
                        onClick={() => reactionMutation.mutate({ postId: post.id, isLike: true })}
                        disabled={reactionMutation.isPending}
                      >
                        <ThumbsUp className={`h-4 w-4 mr-1 ${post.userReaction?.isLike ? "fill-current" : ""}`} />
                        <span>{post.reactions.likes}</span>
                      </Button>
                      <Button
                        variant={post.userReaction?.isLike === false ? "default" : "ghost"}
                        size="sm"
                        onClick={() => reactionMutation.mutate({ postId: post.id, isLike: false })}
                        disabled={reactionMutation.isPending}
                      >
                        <ThumbsDown className={`h-4 w-4 mr-1 ${post.userReaction?.isLike === false ? "fill-current" : ""}`} />
                        <span>{post.reactions.dislikes}</span>
                      </Button>
                    </div>
                    <ReportDialog type="post" id={post.id} />
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