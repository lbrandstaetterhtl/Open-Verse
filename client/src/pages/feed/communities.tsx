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
      {/* Sticky Top Header – Glass Effect on Mobile, Subtle on Desktop */}
      <header className="sticky top-14 md:relative md:top-0 z-40 w-full glass-premium border-b border-border/40 md:border-none">
        <div className="max-w-[1280px] mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary md:hidden" />
            <h1 className="text-base md:hidden font-black tracking-tight uppercase">
              {t("communities_feed.header_title")}
            </h1>
          </div>
          
          <div className="flex items-center gap-2 ml-auto">
             <Link href="/create-community">
                <Button variant="ghost" size="sm" className="h-8 rounded-full hover:bg-primary/10 hover:text-primary transition-all active:scale-90">
                  <Plus className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline text-xs font-bold">{t("communities_feed.create_button")}</span>
                </Button>
              </Link>
          </div>
        </div>
      </header>

      <main className="w-full">
        <div className="max-w-[1280px] mx-auto flex flex-col lg:flex-row min-h-screen bg-card/5 md:bg-background border-x border-border/40">
          
          {/* Left Sidebar - Communities & Search */}
          <aside className="w-full lg:w-72 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-border/40 p-4">
             <div className="lg:sticky lg:top-28 space-y-6">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("communities_feed.search_placeholder")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-10 rounded-full bg-muted/50 border-transparent focus:bg-background focus:ring-primary/20 transition-all text-sm"
                  />
                </div>

                {/* My Communities */}
                <div>
                   <h3 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-3 px-2">
                     {t("communities_feed.my_communities")}
                   </h3>
                   <div className="space-y-1">
                      {communitiesLoading ? (
                        Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)
                      ) : myCommunities?.map((c) => (
                        <Link key={c.id} href={`/c/${c.slug}`}>
                          <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-accent/50 cursor-pointer transition-all active:scale-95 group">
                            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary font-bold text-xs">
                              {c.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                               <p className="text-sm font-bold truncate">{c.name}</p>
                               <p className="text-[10px] text-muted-foreground uppercase font-black">{c.role || "member"}</p>
                            </div>
                          </div>
                        </Link>
                      ))}
                   </div>
                </div>
             </div>
          </aside>

          {/* Main Feed */}
          <div className="flex-1 min-w-0">
            <div className="max-w-[680px] mx-auto">
              <div className="relative min-h-[400px]">
                {postsLoading ? (
                  <div className="p-4 space-y-4">
                    <SkeletonFeed />
                  </div>
                ) : postsError ? (
                  <div className="p-8 animate-scale-in">
                    <ErrorState 
                      message={(postsError as Error).message} 
                      retry={() => queryClient.invalidateQueries({ queryKey: ["/api/feed/communities"] })}
                    />
                  </div>
                ) : posts?.length === 0 ? (
                  <div className="p-20 text-center animate-scale-in">
                    <Users className="h-16 w-16 mx-auto text-muted-foreground/20 mb-4" />
                    <h2 className="text-xl font-bold tracking-tight">{t("communities_feed.no_posts")}</h2>
                    <p className="text-sm text-muted-foreground mt-2">{t("communities_feed.no_posts_desc")}</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/40">
                    {posts?.map((post) => (
                      <PostCard key={post.id} post={post} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Sidebar - Suggestions (Placeholder) */}
          <aside className="hidden xl:block w-80 flex-shrink-0 border-l border-border/40 p-6">
             <div className="sticky top-28">
                <div className="p-4 rounded-2xl bg-muted/20 border border-border/40">
                   <h3 className="font-bold text-sm mb-2">Entdecke Communities</h3>
                   <p className="text-xs text-muted-foreground leading-relaxed">
                     Finde Gleichgesinnte in über 1.000 Themenbereichen.
                   </p>
                </div>
             </div>
          </aside>
        </div>
      </main>
    </PageTransition>
  );
}
