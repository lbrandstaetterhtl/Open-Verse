import { Navbar } from "@/components/layout/navbar";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertMediaPostSchema } from "@shared/schema";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Newspaper } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import * as z from "zod";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

type FormData = z.infer<typeof insertMediaPostSchema>;

import { useTranslation } from "react-i18next";

export default function CreateNewsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const communityId = searchParams.get("communityId");

  const form = useForm<FormData>({
    resolver: zodResolver(insertMediaPostSchema),
    defaultValues: {
      title: "",
      content: "",
      category: "news",
    },
  });

  const createPostMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const formData = new FormData();
      formData.append("title", data.title);
      formData.append("content", data.content);
      formData.append("category", data.category);

      if (communityId) {
        formData.append("communityId", communityId);
      }

      const mediaFile = form.getValues("mediaFile");
      if (mediaFile?.[0]) {
        formData.append("media", mediaFile[0]);
        formData.append(
          "mediaType",
          data.mediaType || (mediaFile[0].type.startsWith("image/") ? "image" : "video"),
        );
      }

      const res = await apiRequest("POST", "/api/posts", formData);
      return res.json();
    },
    onSuccess: () => {
      // Invalidate all post-related queries
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feed/communities"] });
      form.reset();
      toast({
        title: t("create_post.news.success_title"),
        description: t("create_post.news.success_desc"),
      });

      if (communityId) {
        // Fetch community to redirect back to it
        fetch(`/api/communities/${communityId}`)
          .then((res) => res.json())
          .then((community) => {
            setLocation(`/c/${community.slug}`);
          })
          .catch(() => setLocation("/feed/media"));
      } else {
        setLocation("/feed/media");
      }
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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Newspaper className="h-5 w-5" />
                <span>{t("create_post.news.title")}</span>
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
                        <FormLabel>{t("create_post.news.headline")}</FormLabel>
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
                        <FormLabel>{t("create_post.news.content")}</FormLabel>
                        <FormControl>
                          <Textarea
                            rows={6}
                            placeholder={t("create_post.news.placeholder")}
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
                        <FormLabel>{t("create_post.media_label")}</FormLabel>
                        <FormControl>
                          <Input
                            type="file"
                            accept="image/*,video/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                onChange(e.target.files);
                                form.setValue(
                                  "mediaType",
                                  file.type.startsWith("image/") ? "image" : "video",
                                );
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
                    disabled={createPostMutation.isPending || !form.formState.isValid}
                    className="w-full"
                  >
                    {createPostMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      t("create_post.news.submit")
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
