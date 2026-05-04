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
      {/* Sticky Top Header – Glass Effect */}
      <header className="sticky top-14 z-40 w-full glass-premium border-b border-border/40">
        <div className="max-w-[680px] mx-auto px-4 h-14 flex items-center justify-between">
          <h1 className="text-base md:text-lg font-black tracking-tight uppercase">
            {t("feed.discussions_title")}
          </h1>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/posts", "discussion"] })}
              className="h-8 w-8 p-0 rounded-full hover:bg-primary/10 hover:text-primary transition-all active:scale-90"
            >
              <div className="h-2 w-2 rounded-full bg-muted" />
            </Button>
          </div>
        </div>
      </header>

      <main className="w-full">
        <div className="max-w-[680px] mx-auto border-x border-border/40 min-h-screen bg-card/5 md:bg-background">
          {/* Content Area */}
          <div className="relative min-h-[400px]">
            {isLoading ? (
              <div className="p-4 space-y-4">
                <SkeletonFeed />
              </div>
            ) : error ? (
              <div className="p-8 animate-scale-in">
                <ErrorState 
                  message={error instanceof Error ? error.message : "Failed to load discussions"} 
                  retry={() => queryClient.invalidateQueries({ queryKey: ["/api/posts", "discussion"] })}
                />
              </div>
            ) : discussions?.length === 0 ? (
              <div className="p-20 animate-scale-in text-center">
                <EmptyState
                  icon={<MessageCircle className="h-12 w-12 text-muted-foreground/50" />}
                  title={t("feed.no_discussions")}
                />
              </div>
            ) : (
              <div className="divide-y divide-border/40">
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
