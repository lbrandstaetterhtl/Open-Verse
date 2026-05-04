import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SkeletonFeed } from "@/components/layout/skeleton-loaders";
import { EmptyState } from "@/components/ui/empty-state";
import { MessageCircle, Pencil } from "lucide-react";
import { Link, useLocation } from "wouter";
import { PostCard } from "@/components/post/post-card";
import { ErrorState } from "@/components/ui/error-state";
import { PageTransition } from "@/components/ui/page-transition";
import { queryClient } from "@/lib/queryClient";
import type { PostWithAuthor } from "@shared/types";
import { motion } from "framer-motion";

export default function DiscussionsFeedPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

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
      <main className="container mx-auto px-4 pt-6 md:pt-20 pb-8">
        <div className="max-w-4xl mx-auto">
          {/* Mobile Header */}
          <div className="lg:hidden mb-6 animate-slide-down">
            <h1 className="text-2xl font-black tracking-tighter mb-2">{t("feed.discussions_title")}</h1>
            <p className="text-xs text-muted-foreground">{t("feed.discussions_subtitle", "Join the conversation on various topics.")}</p>
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

      {/* Mobile FAB – Create Discussion */}
      <motion.div
        className="fixed bottom-24 right-4 z-50 md:hidden"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 25, delay: 0.3 }}
      >
        <Button
          onClick={() => setLocation("/post/discussions")}
          className="h-14 w-14 rounded-2xl shadow-xl shadow-primary/30 hover:shadow-primary/50 transition-all active:scale-90 bg-primary hover:bg-primary/90"
          aria-label={t("feed.create_discussion")}
        >
          <Pencil className="h-6 w-6" />
        </Button>
      </motion.div>
    </PageTransition>
  );
}
