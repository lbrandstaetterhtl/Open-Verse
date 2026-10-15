import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SkeletonFeed } from "@/components/layout/skeleton-loaders";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Plus, MessageCircle, Filter, Hash, Quote } from "lucide-react";
import { Link } from "wouter";
import { PostCard } from "@/components/post/post-card";
import type { PostWithAuthor } from "@shared/types";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";

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
      <main className="w-full px-4 md:px-8 pb-12 md:pb-16">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mb-8 md:mb-10"
        >
          <PageHeader
            eyebrow={t("feed.eyebrow_discussions", "Feed / Discussions")}
            title={t("navbar.discussions_feed")}
            description={t("feed.discussion_description", "Connect, debate, and share ideas with a community that values deep conversations.")}
            actions={
              <Link href="/post/discussions" className="w-full sm:w-auto">
                <Button className="w-full sm:w-auto">
                  <Plus className="h-4 w-4" />
                  {t("feed.start_discussion", "Start conversation")}
                </Button>
              </Link>
            }
          />
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
                message={error instanceof Error ? error.message : "Failed to load discussions"} 
                retry={() => queryClient.invalidateQueries({ queryKey: ["/api/posts", "discussion"] })}
              />
            </div>
          ) : discussions?.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="ov-panel flex flex-col items-center justify-center px-6 py-16 md:py-24 text-center"
            >
              <div className="ov-cut mb-6 flex h-14 w-14 items-center justify-center rounded-sm bg-primary/10 md:h-16 md:w-16">
                <MessageCircle className="h-7 w-7 text-primary md:h-8 md:w-8" />
              </div>
              <h3 className="font-display text-xl md:text-2xl font-semibold mb-2">{t("feed.no_discussions", "Silence in the Verse")}</h3>
              <p className="text-muted-foreground text-sm md:text-base max-w-sm px-4">{t("feed.no_discussions_desc", "Every great movement started with a single word. Be the first to speak.")}</p>
              <Link href="/post/discussions" className="mt-8">
                <Button variant="outline">
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
