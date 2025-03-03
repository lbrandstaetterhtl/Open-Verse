import { Navbar } from "@/components/layout/navbar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Post, insertMediaPostSchema } from "@shared/schema";
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
import { ThumbsUp, ThumbsDown, Flag, AlertTriangle, Loader2, Newspaper, Image, Video } from "lucide-react";
import { format } from "date-fns";
import * as z from 'zod';
import { Report } from "@shared/schema";

export default function NewsPage() {
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: posts, isLoading } = useQuery<Post[]>({
    queryKey: ["/api/posts", "news"],
    queryFn: async () => {
      const res = await fetch("/api/posts?category=news");
      if (!res.ok) throw new Error("Failed to fetch posts");
      return res.json();
    },
  });

  type FormData = z.infer<typeof insertMediaPostSchema>;
  const form = useForm<FormData>({
    resolver: zodResolver(insertMediaPostSchema),
    defaultValues: {
      title: "",
      content: "",
      category: "news",
    },
  });

  const createPostMutation = useMutation<Post, Error, FormData>({
    mutationFn: async (data) => {
      // Create FormData for file upload
      const formData = new FormData();
      formData.append("title", data.title);
      formData.append("content", data.content);
      formData.append("category", data.category);

      const mediaFile = form.getValues("mediaFile");
      if (mediaFile?.[0]) {
        formData.append("media", mediaFile[0]);
      }

      const res = await fetch("/api/posts", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Failed to create post");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts", "news"] });
      form.reset();
      toast({
        title: "News posted",
        description: "Your news article has been posted successfully.",
      });
    },
  });

  const karmaUpdateMutation = useMutation<Post, Error, { postId: number; karma: number }>({
    mutationFn: async ({ postId, karma }) => {
      const res = await apiRequest("POST", `/api/posts/${postId}/karma`, { karma });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts", "news"] });
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
        description: "Thank you for helping combat misinformation.",
      });
    },
  });

  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 pt-24">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center space-x-4 mb-8">
            <h1 className="text-4xl font-bold">News</h1>
            <Badge variant="secondary" className="text-primary">
              <AlertTriangle className="h-4 w-4 mr-1" />
              Fact-checked
            </Badge>
          </div>

          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Newspaper className="h-5 w-5" />
                <span>Share News</span>
              </CardTitle>
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
                        <FormLabel>Headline</FormLabel>
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
                        <FormLabel>Article Content</FormLabel>
                        <FormControl>
                          <Textarea
                            rows={6}
                            placeholder="Write your news article here. Please ensure it's factual and properly sourced."
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
                                onChange(e.target.files);
                                form.setValue("mediaType", file.type.startsWith("image/") ? "image" : "video");
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
                      "Submit News"
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
                No news articles yet. Be the first to share important news!
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-6">
              {posts?.map((post) => (
                <Card key={post.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>{post.title}</CardTitle>
                      <Badge variant="outline" className="text-primary">
                        News
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Published on {format(new Date(post.createdAt), "PPP")}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap mb-4">{post.content}</p>
                    {post.mediaUrl && (
                      <div className="mt-4 rounded-lg overflow-hidden bg-gray-100">
                        {post.mediaType === 'image' ? (
                          <img
                            src={post.mediaUrl}
                            alt="News content"
                            className="w-full h-auto max-h-[500px] object-contain"
                          />
                        ) : post.mediaType === 'video' ? (
                          <video
                            src={post.mediaUrl}
                            controls
                            className="w-full max-h-[500px]"
                          />
                        ) : null}
                      </div>
                    )}
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
                          reason: "Misinformation",
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