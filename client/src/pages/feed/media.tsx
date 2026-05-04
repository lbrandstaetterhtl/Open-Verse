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
import { cn } from "@/lib/utils";

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
      {/* Sticky Top Header – Glass Effect on Mobile, Subtle on Desktop */}
      <header className="sticky top-14 md:relative md:top-0 z-40 w-full glass-premium border-b border-border/40 md:border-none">
        <div className="max-w-[680px] mx-auto px-4 h-14 flex items-center justify-between">
          <h1 className="text-base md:hidden font-black tracking-tight uppercase">
            {t("feed.media_title")}
          </h1>
          
          <div className="flex items-center gap-2 ml-auto">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/posts", "media"] })}
              className="h-8 w-8 p-0 rounded-full hover:bg-primary/10 hover:text-primary transition-all active:scale-90"
            >
              <div className={cn("h-2 w-2 rounded-full", isRefetching ? "bg-primary animate-pulse" : "bg-muted")} />
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
                  message={error instanceof Error ? error.message : "Failed to load posts"} 
                  retry={() => queryClient.invalidateQueries({ queryKey: ["/api/posts", "media"] })}
                />
              </div>
            ) : posts?.length === 0 ? (
              <div className="p-20 animate-scale-in text-center">
                <EmptyState
                  icon={<ImageIcon className="h-12 w-12 text-muted-foreground/50" />}
                  title={t("feed.no_posts")}
                />
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {posts?.map((post) => (
                  <PostCard 
                    key={post.id} 
                    post={post} 
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </PageTransition>
  );
}
