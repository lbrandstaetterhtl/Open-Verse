import { useTranslation } from "react-i18next";
import { Navbar } from "@/components/layout/navbar";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { MessageCircle } from "lucide-react";
import { Link } from "wouter";
import { PostCard } from "@/components/post/post-card";
import type { PostWithAuthor } from "@shared/types";

export default function DiscussionsFeedPage() {
  const { t } = useTranslation();

  const { data: discussions, isLoading } = useQuery<PostWithAuthor[]>({
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
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 pt-24">
        <div className="max-w-3xl mx-auto">
          <div className="lg:hidden mb-6">
            <h1 className="text-2xl font-bold mb-4">{t("feed.discussions_title")}</h1>
            <Button asChild size="sm" className="whitespace-nowrap">
              <Link href="/post/discussions">{t("feed.create_discussion")}</Link>
            </Button>
          </div>

          <div className="hidden lg:flex items-center justify-between mb-8">
            <h1 className="text-4xl font-bold">{t("feed.discussions_title")}</h1>
            <Button asChild>
              <Link href="/post/discussions">{t("feed.create_discussion")}</Link>
            </Button>
          </div>

          {isLoading ? (
            <Spinner size="lg" className="p-8" />
          ) : discussions?.length === 0 ? (
            <EmptyState
              icon={<MessageCircle className="h-10 w-10 text-muted-foreground" />}
              title={t("feed.no_discussions")}
            />
          ) : (
            <div className="space-y-4 lg:space-y-6">
              {discussions?.map((post) => (
                <PostCard key={post.id} post={post} reportType="discussion" />
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
