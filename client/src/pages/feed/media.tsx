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
      <main className="w-full min-h-screen bg-background relative pb-20">
        {/* Cinematic Header Section */}
        <div className="relative overflow-hidden pt-12 pb-8 md:pt-20 md:pb-12">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
          <div className="max-w-[680px] mx-auto px-4 relative">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase leading-[0.9]">
                Media <span className="text-primary/40 block">Explorer</span>
              </h1>
              <p className="mt-4 text-muted-foreground/60 font-medium max-w-sm text-xs md:text-sm uppercase tracking-widest leading-relaxed">
                Discover stories, news, and deep-dives from the Open-Verse community.
              </p>
            </motion.div>
            
            <div className="absolute right-4 bottom-0">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/posts", "media"] })}
                className="group h-10 w-10 p-0 rounded-2xl bg-card/40 backdrop-blur-md border border-border/40 hover:bg-primary/10 hover:text-primary transition-all active:scale-90"
              >
                <div className={cn(
                  "h-2 w-2 rounded-full transition-all duration-500", 
                  isRefetching ? "bg-primary scale-150 animate-pulse" : "bg-muted-foreground/40 group-hover:bg-primary/60"
                )} />
              </Button>
            </div>
          </div>
        </div>

        <div className="max-w-[680px] mx-auto px-0 md:px-4">
          <div className="relative min-h-[400px]">
            {isLoading ? (
              <div className="p-4 space-y-8">
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-card/20 rounded-[2rem] border border-border/40 p-6">
                    <SkeletonFeed />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="p-8 animate-scale-in">
                <ErrorState 
                  message={error instanceof Error ? error.message : "Failed to load posts"} 
                  retry={() => queryClient.invalidateQueries({ queryKey: ["/api/posts", "media"] })}
                />
              </div>
            ) : posts?.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-20 text-center bg-card/10 rounded-[3rem] border border-dashed border-border/40 mx-4"
              >
                <EmptyState
                  icon={<ImageIcon className="h-16 w-16 text-muted-foreground/20" />}
                  title={t("feed.no_posts")}
                  description="Be the first one to share a story in this feed."
                />
              </motion.div>
            ) : (
              <div className="flex flex-col gap-1 md:gap-4">
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
