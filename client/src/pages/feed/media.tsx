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

export default function MediaFeedPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeCategory, setActiveCategory] = useState<string>("all");

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
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative mb-12 overflow-hidden rounded-[2rem] md:rounded-[3rem] bg-gradient-to-br from-primary/10 via-card/40 to-accent/5 border border-white/10 backdrop-blur-3xl p-6 md:p-12 lg:p-16 shadow-2xl shadow-primary/5"
        >
          {/* Abstract background blobs */}
          <div className="absolute -top-32 -left-32 w-80 h-80 bg-primary/20 rounded-full blur-[100px] animate-pulse pointer-events-none" />
          <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-accent/20 rounded-full blur-[100px] animate-pulse pointer-events-none" style={{ animationDelay: '1s' }} />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8 md:gap-12">
            <div className="space-y-4 md:space-y-6">
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md text-primary text-[10px] font-black uppercase tracking-[0.2em]"
              >
                <Sparkles className="h-3 w-3" />
                {t("feed.curated", "Curated Feed")}
              </motion.div>
              <h1 className="text-4xl md:text-6xl lg:text-8xl font-black tracking-tighter leading-[0.85] uppercase italic flex flex-col sm:block">
                Media <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-primary/60 to-accent whitespace-nowrap">Verse</span>
              </h1>
              <p className="text-base md:text-xl text-muted-foreground/80 font-medium max-w-lg leading-relaxed">
                {t("feed.media_description", "The most visual and engaging stories curated for your exploration.")}
              </p>
            </div>

            <div className="flex flex-col gap-4 md:gap-6 lg:items-end">
              <div className="p-1.5 md:p-2 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl flex flex-wrap gap-1.5 md:gap-2 w-full sm:w-fit lg:ml-auto">
                {["all", "news", "entertainment"].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`flex-1 sm:flex-none px-4 md:px-6 py-2.5 md:py-3 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-wider transition-all duration-500 ${
                      activeCategory === cat 
                        ? "bg-primary text-white shadow-[0_0_20px_rgba(var(--primary),0.3)] scale-105" 
                        : "text-muted-foreground hover:bg-white/5"
                    }`}
                  >
                    {t(`feed.${cat}`)}
                  </button>
                ))}
              </div>
              <div className="flex gap-4 w-full sm:w-auto lg:ml-auto">
                <Link href="/post/news" className="w-full sm:w-auto">
                  <Button className="w-full sm:w-auto h-14 md:h-16 px-8 md:px-10 rounded-2xl shadow-xl shadow-primary/20 gap-3 font-black uppercase tracking-widest text-[10px] md:text-xs transition-all hover:shadow-primary/40 hover:-translate-y-1 active:translate-y-0 active:scale-95">
                    <Plus className="h-5 w-5 stroke-[3px]" />
                    {t("feed.create_story", "Create Story")}
                  </Button>
                </Link>
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
    </div>
  );
}
