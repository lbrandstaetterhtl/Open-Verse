import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SkeletonFeed } from "@/components/layout/skeleton-loaders";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Plus, ImageIcon, Pencil } from "lucide-react";
import { useLocation } from "wouter";
import { PostCard } from "@/components/post/post-card";
import { PageTransition } from "@/components/ui/page-transition";
import type { PostWithAuthor } from "@shared/types";
import { motion } from "framer-motion";

export default function MediaFeedPage() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const {
    data: posts,
    isLoading,
    isRefetching,
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
    staleTime: 15000,
  });

  return (
    <PageTransition>
      <main className="container mx-auto px-4 pt-6 md:pt-20 pb-8">
        <div className="max-w-4xl mx-auto">
          {/* Mobile Header with Smooth Entry */}
          <div className="lg:hidden mb-6 animate-slide-down">
            <h1 className="text-2xl font-black tracking-tighter mb-2">{t("feed.media_title")}</h1>
            <p className="text-xs text-muted-foreground">{t("feed.media_subtitle", "Stay updated with the latest news and entertainment.")}</p>
          </div>

          {/* Desktop Header with Smooth Entry */}
          <div className="hidden lg:flex items-center justify-between mb-8 animate-slide-down">
            <h1 className="text-3xl font-bold tracking-tight">{t("feed.media_title")}</h1>
            <div className="flex gap-3">
              <Button 
                onClick={() => setLocation("/post/news")}
                className="rounded-xl px-6 active:scale-95 transition-all hover:shadow-md"
              >
                {t("feed.post_news")}
              </Button>
              <Button 
                onClick={() => setLocation("/post/entertainment")}
                className="rounded-xl px-6 active:scale-95 transition-all hover:shadow-md"
              >
                {t("feed.post_entertainment")}
              </Button>
            </div>
          </div>

          {/* Content Area with Fluid Transitions */}
          <div className="relative min-h-[400px]">
            {isLoading ? (
              <div className="animate-fade-in">
                <SkeletonFeed />
              </div>
            ) : error ? (
              <div className="animate-fade-scale">
                <ErrorState 
                  message={error instanceof Error ? error.message : "Failed to load posts"} 
                  retry={() => queryClient.invalidateQueries({ queryKey: ["/api/posts", "media"] })}
                />
              </div>
            ) : posts?.length === 0 ? (
              <div className="animate-fade-scale">
                <EmptyState
                  icon={<ImageIcon className="h-12 w-12 text-muted-foreground/50" />}
                  title={t("feed.no_posts")}
                />
              </div>
            ) : (
              <div className="space-y-4 lg:space-y-6">
                {posts?.map((post, index) => (
                  <PostCard 
                    key={post.id} 
                    post={post} 
                  />
                ))}
              </div>
            )}

            {/* Subtle loading overlay for background refetches */}
            {isRefetching && !isLoading && (
              <div className="fixed bottom-8 right-8 bg-primary/10 backdrop-blur-md rounded-full px-4 py-2 border border-primary/20 flex items-center gap-2 animate-slide-up shadow-lg z-50">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                <span className="text-xs font-medium text-primary">Actualizando...</span>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Mobile FAB – Create Post */}
      <motion.div
        className="fixed bottom-24 right-4 z-50 md:hidden"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 25, delay: 0.3 }}
      >
        <Button
          onClick={() => setLocation("/post/news")}
          className="h-14 w-14 rounded-2xl shadow-xl shadow-primary/30 hover:shadow-primary/50 transition-all active:scale-90 bg-primary hover:bg-primary/90"
          aria-label={t("feed.post_news")}
        >
          <Pencil className="h-6 w-6" />
        </Button>
      </motion.div>
    </PageTransition>
  );
}
