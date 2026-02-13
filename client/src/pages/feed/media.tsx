import { useTranslation } from "react-i18next";
import { Navbar } from "@/components/layout/navbar";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Plus, ImageIcon } from "lucide-react";
import { useLocation } from "wouter";
import { PostCard } from "@/components/post/post-card";
import type { PostWithAuthor } from "@shared/types";

export default function MediaFeedPage() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();

  const {
    data: posts,
    isLoading,
    error,
  } = useQuery<PostWithAuthor[]>({
    queryKey: ["/api/posts", "media"],
    queryFn: async () => {
      const res = await fetch(
        "/api/posts?category=news,entertainment&include=author,comments,reactions,userReaction",
        {
          headers: {
            "x-auto-refresh": "true",
          },
        },
      );
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "Failed to fetch posts");
      }
      return res.json();
    },
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 pt-24">
        <div className="max-w-3xl mx-auto">
          <div className="lg:hidden mb-6">
            <h1 className="text-2xl font-bold mb-4">{t("feed.media_title")}</h1>
            <div className="flex gap-2 overflow-x-auto pb-2">
              <Button size="sm" className="whitespace-nowrap" onClick={() => setLocation("/post/news")}>
                <Plus className="h-4 w-4 mr-1" />
                {t("feed.post_news")}
              </Button>
              <Button size="sm" className="whitespace-nowrap" onClick={() => setLocation("/post/entertainment")}>
                <Plus className="h-4 w-4 mr-1" />
                {t("feed.post_entertainment")}
              </Button>
            </div>
          </div>

          <div className="hidden lg:flex items-center justify-between mb-8">
            <h1 className="text-4xl font-bold">{t("feed.media_title")}</h1>
            <div className="space-x-4">
              <Button onClick={() => setLocation("/post/news")}>
                {t("feed.post_news")}
              </Button>
              <Button onClick={() => setLocation("/post/entertainment")}>
                {t("feed.post_entertainment")}
              </Button>
            </div>
          </div>

          {isLoading ? (
            <Spinner size="lg" className="p-8" />
          ) : error ? (
            <ErrorState message={error.message} />
          ) : posts?.length === 0 ? (
            <EmptyState
              icon={<ImageIcon className="h-10 w-10 text-muted-foreground" />}
              title={t("feed.no_posts")}
            />
          ) : (
            <div className="space-y-4 lg:space-y-6">
              {posts?.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
