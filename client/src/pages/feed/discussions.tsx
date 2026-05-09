import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SkeletonFeed } from "@/components/layout/skeleton-loaders";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Plus, MessageCircle, Sparkles, Filter, Hash, Quote } from "lucide-react";
import { Link } from "wouter";
import { PostCard } from "@/components/post/post-card";
import type { PostWithAuthor } from "@shared/types";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

export default function DiscussionsFeedPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeCategory] = useState<string>("discussion");

  const {
    data: discussions,
    isLoading,
    isRefetching,
    error,
  } = useQuery<PostWithAuthor[]>({
    queryKey: ["/api/posts", "discussion"],
    queryFn: async () => {
      const res = await fetch(
        `/api/posts?category=discussion&include=author,comments,reactions,userReaction`,
        { headers: { "x-auto-refresh": "true" } }
      );
      if (!res.ok) throw new Error(await res.text() || "Failed to fetch discussions");
      return res.json();
    },
    refetchInterval: 30000,
  });

  return (
    <div className="min-h-screen bg-transparent text-foreground">
      <main className="w-full px-4 md:px-8 py-6 md:py-12">
        {/* Cinematic Premium Header (Matched to Media Feed) */}
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
            <div className="space-y-6 md:space-y-8">
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="inline-flex items-center gap-3 px-5 py-2 rounded-full bg-primary/20 border border-primary/20 backdrop-blur-xl text-primary text-[10px] font-black uppercase tracking-[0.3em] shadow-lg shadow-primary/20"
              >
                <Sparkles className="h-4 w-4" />
                {t("feed.community_voices", "Community Voices")}
              </motion.div>
              <h1 className="text-5xl md:text-8xl lg:text-[10rem] font-black tracking-tighter leading-[0.8] uppercase italic flex flex-col sm:block">
                Discussion <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-primary/60 to-accent whitespace-nowrap drop-shadow-[0_0_30px_rgba(var(--primary),0.3)]">Verse</span>
              </h1>
              <p className="text-lg md:text-2xl text-muted-foreground font-medium max-w-xl leading-relaxed opacity-80">
                {t("feed.discussion_description", "Connect, debate, and share ideas with a community that values deep conversations.")}
              </p>
            </div>

            <div className="flex flex-col gap-6 md:gap-8 lg:items-end">
              <div className="flex gap-4 w-full sm:w-auto lg:ml-auto">
                <Link href="/post/discussion" className="w-full sm:w-auto">
                  <Button className="w-full sm:w-auto h-16 md:h-20 px-10 md:px-14 rounded-full shadow-2xl shadow-primary/30 gap-4 font-black uppercase tracking-widest text-[11px] md:text-xs transition-all hover:shadow-primary/50 hover:-translate-y-2 active:translate-y-0 active:scale-95 nebula-glow">
                    <Plus className="h-6 w-6 stroke-[4px]" />
                    {t("feed.start_discussion", "Start Conversation")}
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
                message={error instanceof Error ? error.message : "Failed to load discussions"} 
                retry={() => queryClient.invalidateQueries({ queryKey: ["/api/posts", "discussion"] })}
              />
            </div>
          ) : discussions?.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-20 md:py-40 text-center rounded-[2rem] md:rounded-[3rem] bg-white/5 border border-dashed border-white/10"
            >
              <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-primary/10 flex items-center justify-center mb-6 md:mb-8 border border-primary/20">
                <MessageCircle className="h-8 w-8 md:h-10 md:h-10 text-primary" />
              </div>
              <h3 className="text-2xl md:text-3xl font-black tracking-tighter uppercase mb-2 md:mb-4">{t("feed.no_discussions", "Silence in the Verse")}</h3>
              <p className="text-muted-foreground text-sm md:text-lg max-w-sm font-medium px-4">{t("feed.no_discussions_desc", "Every great movement started with a single word. Be the first to speak.")}</p>
              <Link href="/post/discussion" className="mt-8">
                <Button variant="outline" className="rounded-xl border-2 font-bold uppercase tracking-widest text-[10px]">
                  Break the Silence
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
                {discussions?.map((post) => (
                  <motion.div
                    key={post.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                    className="group"
                  >
                    <PostCard post={post} variant="media" reportType="discussion" />
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
