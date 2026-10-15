import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PostCard } from "@/components/post/post-card";
import type { PostWithAuthor } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Users, Search, Hash, Lock } from "lucide-react";
import { SkeletonFeed } from "@/components/layout/skeleton-loaders";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { PageTransition } from "@/components/ui/page-transition";
import { PageHeader } from "@/components/layout/page-header";
import { useTranslation } from "react-i18next";
import { queryClient } from "@/lib/queryClient";

interface Community {
  id: number;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  creatorId: number;
  role?: string;
  isPrivate?: boolean;
}

export default function CommunityFeedPage() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch posts from joined communities
  const {
    data: posts,
    isLoading: postsLoading,
    error: postsError,
  } = useQuery<PostWithAuthor[]>({
    queryKey: ["/api/feed/communities"],
    queryFn: async () => {
      const res = await fetch("/api/feed/communities");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    staleTime: 15000,
  });

  // Fetch user's joined communities
  const { data: myCommunities, isLoading: communitiesLoading } = useQuery<Community[]>({
    queryKey: ["/api/user/communities"],
    queryFn: async () => {
      const res = await fetch("/api/user/communities");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  // Fetch all communities for search
  const { data: allCommunities } = useQuery<Community[]>({
    queryKey: ["/api/communities"],
    queryFn: async () => {
      const res = await fetch("/api/communities");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  // Filter communities by search
  const filteredCommunities = searchQuery.trim()
    ? allCommunities?.filter(
      (c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.description?.toLowerCase().includes(searchQuery.toLowerCase()),
    )
    : null;

  return (
    <PageTransition>
      <main className="w-full">
        <div className="px-4 md:px-6">
          <PageHeader
            eyebrow={t("communities_feed.eyebrow", "Feed / Communities")}
            title={t("communities_feed.header_title")}
            description={t("communities_feed.header_desc")}
          />
        </div>
        <div className="flex flex-col lg:flex-row min-h-screen">
          
          {/* Left Sidebar - Communities & Search */}
          <aside className="w-full lg:w-80 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-border/40 p-4 md:p-6">
             <div className="lg:sticky lg:top-6 space-y-8">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("communities_feed.search_placeholder")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-11 bg-muted/30 focus:bg-background transition-colors text-sm"
                  />
                </div>

                {/* My Communities */}
                <div>
                   <h3 className="ov-label mb-3 px-2">
                     {t("communities_feed.my_communities")}
                   </h3>
                   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-1">
                      {communitiesLoading ? (
                        Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)
                      ) : myCommunities?.map((c) => (
                        <Link key={c.id} href={`/c/${c.slug}`}>
                          <div className="ov-cut flex items-center gap-3 p-2.5 hover:bg-accent/50 cursor-pointer transition-colors group">
                            <div className="ov-avatar h-10 w-10 bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary font-semibold text-sm">
                              {c.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                               <p className="text-sm font-semibold truncate">{c.name}</p>
                               <p className="ov-label">{c.role || "member"}</p>
                            </div>
                          </div>
                        </Link>
                      ))}

                      <Link href="/create-community">
                        <Button variant="outline" className="w-full mt-2">
                          <Plus className="h-4 w-4" />
                          {t("communities_feed.create_button")}
                        </Button>
                      </Link>
                   </div>
                </div>
             </div>
          </aside>

          {/* Main Feed */}
          <div className="flex-1 min-w-0 bg-card/5 md:bg-transparent">
            <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8">
              <div className="relative min-h-[400px] space-y-6">
                {postsLoading ? (
                  <SkeletonFeed />
                ) : postsError ? (
                  <div className="p-8">
                    <ErrorState 
                      message={(postsError as Error).message} 
                      retry={() => queryClient.invalidateQueries({ queryKey: ["/api/feed/communities"] })}
                    />
                  </div>
                ) : posts?.length === 0 ? (
                  <div className="ov-panel p-10 md:p-12 text-center">
                    <Users className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                    <h2 className="font-display text-xl font-semibold">{t("communities_feed.no_posts")}</h2>
                    <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">{t("communities_feed.no_posts_desc")}</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {posts?.map((post) => (
                      <PostCard key={post.id} post={post} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Sidebar - Suggestions (Responsive visibility) */}
          <aside className="hidden xl:block w-80 flex-shrink-0 border-l border-border/40 p-8">
             <div className="sticky top-6">
                <div className="ov-panel p-5">
                   <h3 className="font-display text-lg font-semibold mb-2">Discover Communities</h3>
                   <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                     Find people with similar interests in over 1,000 topic areas. Join the conversation and share your passion.
                   </p>
                   <Button variant="secondary" className="w-full">
                      Explore All
                   </Button>
                </div>
             </div>
          </aside>
        </div>
      </main>
    </PageTransition>
  );
}
