import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SkeletonFeed } from "@/components/layout/skeleton-loaders";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Plus, ImageIcon, Camera, Play, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { PostCard } from "@/components/post/post-card";
import type { PostWithAuthor } from "@shared/types";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { CreatePostSelectorDialog } from "@/components/post/create-post-selector-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { fadeIn, fadeInUp, staggerContainer } from "@/lib/animations";

export default function MediaFeedPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
  } = useInfiniteQuery({
    queryKey: ["/api/posts", "media", activeCategory],
    queryFn: async ({ pageParam = 0 }) => {
      const categoryFilter = activeCategory === "all" ? "news,entertainment" : activeCategory;
      const res = await fetch(
        `/api/posts?category=${categoryFilter}&include=author,comments,reactions,userReaction&limit=12&offset=${pageParam}`,
        { headers: { "x-auto-refresh": "true" } }
      );
      if (!res.ok) throw new Error(await res.text() || "Failed to fetch posts");
      return res.json() as Promise<PostWithAuthor[]>;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < 12) return undefined;
      return allPages.length * 12;
    },
    refetchInterval: 60000,
  });

  // Infinite Scroll Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const posts = data?.pages.flatMap((page) => page) ?? [];

  return (
    <div className="min-h-screen bg-transparent text-foreground">
      <main className="w-full px-4 md:px-8 pb-12 md:pb-16">
        <motion.div variants={fadeIn} initial="initial" animate="animate" className="mb-8 md:mb-10">
          <PageHeader
            eyebrow={t("feed.eyebrow_media", "Feed / Media")}
            title={t("navbar.media_feed")}
            description={t("feed.media_description", "The most visual and engaging stories curated for your exploration.")}
            actions={
              <Button onClick={() => setIsCreateDialogOpen(true)} className="w-full sm:w-auto">
                <Plus className="h-4 w-4" />
                {t("feed.create_story", "Create story")}
              </Button>
            }
          >
            <div className="inline-flex w-full flex-wrap gap-1 rounded-pill border border-border bg-background/40 p-1 sm:w-fit">
              {["all", "news", "entertainment"].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    "flex-1 rounded-pill px-4 py-1.5 text-sm transition-colors duration-150 sm:flex-none",
                    activeCategory === cat
                      ? "ov-tab-active font-semibold"
                      : "font-medium text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t(`feed.${cat}`)}
                </button>
              ))}
            </div>
          </PageHeader>
        </motion.div>

        {/* Content Section */}
        <div className="relative">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-10">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="ov-panel aspect-[4/5] animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="py-20 animate-in fade-in zoom-in duration-500">
              <ErrorState 
                message={error instanceof Error ? error.message : "Failed to load media"} 
                retry={() => queryClient.invalidateQueries({ queryKey: ["/api/posts", "media"] })}
              />
            </div>
          ) : posts.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="ov-panel flex flex-col items-center justify-center px-6 py-16 md:py-24 text-center"
            >
              <div className="ov-cut mb-6 flex h-14 w-14 items-center justify-center rounded-sm bg-primary/10 md:h-16 md:w-16">
                <Camera className="h-7 w-7 text-primary md:h-8 md:w-8" />
              </div>
              <h3 className="font-display text-xl md:text-2xl font-semibold mb-2">{t("feed.no_media", "Silence in the Verse")}</h3>
              <p className="text-muted-foreground text-sm md:text-base max-w-sm px-4">{t("feed.no_media_desc", "Be the spark that ignites this feed. Share your first media post now.")}</p>
              <Link href="/post/news" className="mt-8">
                <Button variant="outline">
                  Ignite Discovery
                </Button>
              </Link>
            </motion.div>
          ) : (
            <>
              <motion.div 
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-10"
              >
                <AnimatePresence mode="popLayout">
                  {posts.map((post) => (
                    <motion.div
                      key={post.id}
                      variants={fadeInUp}
                      layout
                      className="group"
                    >
                      <PostCard post={post} variant="media" />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
              
              {/* Load More Trigger */}
              <div ref={loadMoreRef} className="py-20 flex justify-center">
                {isFetchingNextPage && (
                  <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="ov-label">Expanding Verse...</p>
                  </div>
                )}
                {!hasNextPage && posts.length > 0 && (
                  <p className="ov-label">You've reached the Edge of the Verse</p>
                )}
              </div>
            </>
          )}
        </div>
      </main>
      <CreatePostSelectorDialog 
        open={isCreateDialogOpen} 
        onOpenChange={setIsCreateDialogOpen} 
        defaultType="media"
      />
    </div>
  );
}
