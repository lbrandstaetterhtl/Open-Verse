import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SkeletonFeed } from "@/components/layout/skeleton-loaders";
import { EmptyState } from "@/components/ui/empty-state";
import { MessageCircle } from "lucide-react";
import { Link } from "wouter";
import { PostCard } from "@/components/post/post-card";
import { ErrorState } from "@/components/ui/error-state";
import { PageTransition } from "@/components/ui/page-transition";
import { queryClient } from "@/lib/queryClient";
import type { PostWithAuthor } from "@shared/types";

export default function DiscussionsFeedPage() {
  const { t } = useTranslation();

  const { data: discussions, isLoading, error } = useQuery<PostWithAuthor[]>({
    queryKey: ["/api/posts", "discussion"],
    queryFn: async () => {
      const res = await fetch("/api/posts?category=discussion", {
        headers: {
          "x-auto-refresh": "true",
        },
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "Failed to fetch discussions");
      }
      return res.json();
    },
    refetchInterval: 30000,
    staleTime: 15000,
  });

  return (
    <PageTransition>
      <main className="container mx-auto px-4 pt-20 pb-8">
        <div className="max-w-4xl mx-auto">
          {/* Mobile Header */}
          <div className="lg:hidden mb-6 animate-slide-down">
            <h1 className="text-xl font-bold mb-4 tracking-tight">{t("feed.discussions_title")}</h1>
            <Link href="/post/discussions">
              <Button size="sm" className="whitespace-nowrap rounded-xl active:scale-95 transition-transform">
                {t("feed.create_discussion")}
              </Button>
            </Link>
          </div>

          {/* Desktop Header */}
          <div className="hidden lg:flex items-center justify-between mb-8 animate-slide-down">
            <h1 className="text-3xl font-bold tracking-tight">{t("feed.discussions_title")}</h1>
            <Link href="/post/discussions">
              <Button className="rounded-xl px-6 active:scale-95 transition-all hover:shadow-md">
                {t("feed.create_discussion")}
              </Button>
            </Link>
          </div>

          {/* Content Area */}
          <div className="relative min-h-[400px]">
            {isLoading ? (
              <div className="animate-fade-in">
                <SkeletonFeed />
              </div>
            ) : error ? (
              <div className="animate-fade-scale">
                <ErrorState 
                  message={error instanceof Error ? error.message : "Failed to load discussions"} 
                  retry={() => queryClient.invalidateQueries({ queryKey: ["/api/posts", "discussion"] })}
                />
              </div>
            ) : discussions?.length === 0 ? (
              <div className="animate-fade-scale">
                <EmptyState
                  icon={<MessageCircle className="h-12 w-12 text-muted-foreground/50" />}
                  title={t("feed.no_discussions")}
                />
              </div>
            ) : (
              <div className="space-y-4 lg:space-y-6">
                {discussions?.map((post) => (
                  <PostCard key={post.id} post={post} reportType="discussion" />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </PageTransition>
  );
}
