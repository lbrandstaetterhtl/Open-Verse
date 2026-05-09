import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SkeletonFeed } from "@/components/layout/skeleton-loaders";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Plus, ImageIcon, Camera, Play, Sparkles, Filter } from "lucide-react";
import { Link } from "wouter";
import { PostCard } from "@/components/post/post-card";
import type { PostWithAuthor } from "@shared/types";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { CreatePostSelectorDialog } from "@/components/post/create-post-selector-dialog";

export default function MediaFeedPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const {
    data: posts,
    isLoading,
    isRefetching,
    error,
  } = useQuery<PostWithAuthor[]>({
    queryKey: ["/api/posts", "media", activeCategory],
    queryFn: async () => {
      const categoryFilter = activeCategory === "all" ? "news,entertainment" : activeCategory;
      const res = await fetch(
        `/api/posts?category=${categoryFilter}&include=author,comments,reactions,userReaction`,
        { headers: { "x-auto-refresh": "true" } }
      );
      if (!res.ok) throw new Error(await res.text() || "Failed to fetch posts");
      return res.json();
    },
    refetchInterval: 60000,
  });

  return (
    <div className="min-h-screen bg-transparent text-foreground">
      <main className="w-full px-4 md:px-8 py-6 md:py-12">
        {/* Cinematic Premium Header */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.98, translateY: 30 }}
          animate={{ opacity: 1, scale: 1, translateY: 0 }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "relative mb-12 overflow-hidden rounded-[3rem] p-8 md:p-16 lg:p-20 shadow-2xl shadow-black/20 border border-white/10",
            "nebula-banner"
          )}
        >
          {/* Animated Background Starfield */}
          <div className="absolute inset-0 starfield opacity-40" />
          
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-10 md:gap-16">
            <div className="space-y-6 md:space-y-8 flex-1 min-w-0">
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="inline-flex items-center gap-3 px-5 py-2 rounded-full bg-primary/20 border border-primary/20 backdrop-blur-xl text-primary text-[10px] font-black uppercase tracking-[0.3em] shadow-lg shadow-primary/20"
              >
                <Sparkles className="h-4 w-4" />
                {t("feed.curated", "Curated Feed")}
              </motion.div>
              <h1 className="text-[clamp(2.5rem,6vw,7rem)] font-black tracking-tighter leading-[0.8] uppercase italic flex flex-col sm:block overflow-hidden">
                Media <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-primary/60 to-accent whitespace-nowrap drop-shadow-[0_0_30px_rgba(var(--primary),0.3)]">Verse</span>
              </h1>
              <p className="text-lg md:text-2xl text-muted-foreground font-medium max-w-xl leading-relaxed opacity-80">
                {t("feed.media_description", "The most visual and engaging stories curated for your exploration.")}
              </p>
            </div>

            <div className="flex flex-col gap-6 md:gap-8 lg:items-end shrink-0">
              <div className="p-2 rounded-full bg-background/40 border border-white/5 backdrop-blur-3xl flex flex-wrap gap-2 w-full sm:w-fit lg:ml-auto relative">
                {["all", "news", "entertainment"].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={cn(
                      "relative flex-1 sm:flex-none px-6 md:px-8 py-3 md:py-4 rounded-full text-[10px] md:text-xs font-black uppercase tracking-widest transition-all duration-500 active:scale-95 z-10",
                      activeCategory === cat ? "text-primary-foreground" : "text-muted-foreground/60 hover:text-foreground"
                    )}
                  >
                    {activeCategory === cat && (
                      <motion.div
                        layoutId="activeFeedTab"
                        className="absolute inset-0 bg-primary rounded-full shadow-2xl shadow-primary/40 z-[-1]"
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      />
                    )}
                    {t(`feed.${cat}`)}
                  </button>
                ))}
              </div>
              <div className="flex gap-4 w-full sm:w-auto lg:ml-auto pt-4">
                <Button 
                  onClick={() => setIsCreateDialogOpen(true)}
                  className="w-full sm:w-auto h-16 md:h-20 px-10 md:px-14 rounded-full shadow-2xl shadow-primary/30 gap-4 font-black uppercase tracking-widest text-[11px] md:text-xs transition-all hover:shadow-primary/50 hover:-translate-y-2 active:translate-y-0 active:scale-95 nebula-glow"
                >
                  <Plus className="h-6 w-6 stroke-[4px]" />
                  {t("feed.create_story", "Create Story")}
                </Button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Content Section */}
        <div className="relative">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-10">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="aspect-[4/5] rounded-[2rem] bg-white/5 animate-pulse border border-white/10 shadow-inner" />
              ))}
            </div>
          ) : error ? (
            <div className="py-20 animate-in fade-in zoom-in duration-500">
              <ErrorState 
                message={error instanceof Error ? error.message : "Failed to load media"} 
                retry={() => queryClient.invalidateQueries({ queryKey: ["/api/posts", "media"] })}
              />
            </div>
          ) : posts?.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-20 md:py-40 text-center rounded-[2rem] md:rounded-[3rem] bg-white/5 border border-dashed border-white/10"
            >
              <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-primary/10 flex items-center justify-center mb-6 md:mb-8 border border-primary/20">
                <Camera className="h-8 w-8 md:h-10 md:h-10 text-primary" />
              </div>
              <h3 className="text-2xl md:text-3xl font-black tracking-tighter uppercase mb-2 md:mb-4">{t("feed.no_media", "Silence in the Verse")}</h3>
              <p className="text-muted-foreground text-sm md:text-lg max-w-sm font-medium px-4">{t("feed.no_media_desc", "Be the spark that ignites this feed. Share your first media post now.")}</p>
              <Link href="/post/news" className="mt-8">
                <Button variant="outline" className="rounded-xl border-2 font-bold uppercase tracking-widest text-[10px]">
                  Ignite Discovery
                </Button>
              </Link>
            </motion.div>
          ) : (
            <motion.div 
              initial="hidden"
              animate="show"
              variants={{
                hidden: { opacity: 0 },
                show: {
                  opacity: 1,
                  transition: { staggerChildren: 0.15 }
                }
              }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-10"
            >
              <AnimatePresence mode="popLayout">
                {posts?.map((post) => (
                  <motion.div
                    key={post.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                    className="group"
                  >
                    <PostCard post={post} variant="media" />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
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
