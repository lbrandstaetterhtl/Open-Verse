import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { Loader2, MessagesSquare } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useMemo } from "react";
import { useLocation } from "wouter";
import { LIMITS, requiredMessage, tooLongMessage } from "@/lib/input-limits";

import { useTranslation } from "react-i18next";

function discussionSchema(t: (key: string) => string) {
  const title = t("server:fields.title");
  const content = t("server:fields.content");
  return z.object({
    title: z.string().trim().min(1, requiredMessage(title)).max(LIMITS.postTitle, tooLongMessage(title, LIMITS.postTitle)),
    content: z.string().trim().min(1, requiredMessage(content)).max(LIMITS.postContent, tooLongMessage(content, LIMITS.postContent)),
    category: z.string().optional(),
  });
}

type FormData = z.infer<ReturnType<typeof discussionSchema>>;

export default function CreateDiscussionPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const communityId = searchParams.get("communityId");

  const schema = useMemo(() => discussionSchema(t), [t]);
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      content: "",
      category: "discussion",
    },
  });

  const createPostMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = { ...data };
      if (communityId) {
        (payload as any).communityId = communityId;
      }
      const res = await apiRequest("POST", "/api/posts", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feed/communities"] });
      toast({
        title: t("create_post.discussion.success_title"),
        description: t("create_post.discussion.success_desc"),
      });

      if (communityId) {
        // Fetch community to redirect back to it
        fetch(`/api/communities/${communityId}`)
          .then((res) => res.json())
          .then((community) => {
            setLocation(`/c/${community.slug}`);
          })
          .catch(() => setLocation("/feed/discussions"));
      } else {
        setLocation("/feed/discussions");
      }
    },
    onError: (error: Error) => {
      // e.g. the posting cooldown (429 POST_COOLDOWN) or a validation error, already translated by apiRequest
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <>
            <main className="container mx-auto px-4 pt-24">
        <div className="max-w-3xl mx-auto">
          <Card>
            <CardHeader className="ov-rule mb-6">
              <CardTitle className="flex items-center gap-2">
                <MessagesSquare className="h-5 w-5 text-primary" />
                <span>{t("create_post.discussion.title")}</span>
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
                        <FormLabel>{t("create_post.discussion.title_label")}</FormLabel>
                        <FormControl>
                          <Input maxLength={LIMITS.postTitle} {...field} />
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
                        <FormLabel>{t("create_post.discussion.content_label")}</FormLabel>
                        <FormControl>
                          <Textarea
                            rows={6}
                            maxLength={LIMITS.postContent}
                            placeholder={t("create_post.discussion.placeholder")}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={createPostMutation.isPending} className="w-full">
                    {createPostMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      t("create_post.discussion.submit")
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
