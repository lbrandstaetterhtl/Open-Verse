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
      <main className="container mx-auto px-4 pt-24 pb-12">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left Sidebar - My Communities & Search */}
          <aside className="w-full lg:w-72 flex-shrink-0 animate-fade-scale">
            <div className="lg:sticky lg:top-24 space-y-4">
              {/* Search Communities */}
              <Card className="border-none shadow-lg bg-card/50 backdrop-blur-md rounded-2xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2 tracking-tight">
                    <Search className="h-4 w-4 text-primary" />
                    {t("communities_feed.search_title")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <Input
                    placeholder={t("communities_feed.search_placeholder")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-10 rounded-xl bg-muted/30 border-none focus:ring-primary/20 transition-all font-medium"
                  />
                  {/* Search Results */}
                  {filteredCommunities && filteredCommunities.length > 0 && (
                    <div className="mt-4 space-y-1 max-h-48 overflow-y-auto no-scrollbar animate-fade-up">
                      {filteredCommunities.map((c) => (
                        <Link key={c.id} href={`/c/${c.slug}`}>
                          <div className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-primary/5 cursor-pointer transition-all active:scale-95 text-sm group">
                            <Hash className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                            <span className="truncate flex items-center gap-1 font-medium group-hover:text-primary transition-colors">
                              {c.name}
                              {c.isPrivate && <Lock className="h-3 w-3 text-muted-foreground" />}
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                  {filteredCommunities && filteredCommunities.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-3 animate-fade-scale px-1 opacity-60">
                      {t("communities_feed.no_results")}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* My Communities */}
              <Card className="border-none shadow-lg bg-card/50 backdrop-blur-md rounded-2xl">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold flex items-center gap-2 tracking-tight">
                      <Users className="h-4 w-4 text-primary" />
                      {t("communities_feed.my_communities")}
                    </CardTitle>
                    <Link href="/create-community">
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-primary/10 hover:text-primary active:scale-90 transition-all shadow-none">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {communitiesLoading ? (
                    <div className="space-y-3 py-2">
                       <Skeleton className="h-10 w-full rounded-xl" />
                       <Skeleton className="h-10 w-full rounded-xl" />
                    </div>
                  ) : myCommunities && myCommunities.length > 0 ? (
                    <div className="space-y-1">
                      {myCommunities.map((c, idx) => (
                        <Link key={c.id} href={`/c/${c.slug}`}>
                          <div 
                            className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-primary/5 cursor-pointer transition-all active:scale-95 group animate-fade-up"
                            style={{ animationDelay: `${idx * 40}ms` }}
                          >
                            <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                              <span className="text-xs font-black text-primary">
                                {c.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold truncate flex items-center gap-1 group-hover:text-primary transition-colors">
                                {c.name}
                                {c.isPrivate && <Lock className="h-3 w-3 text-muted-foreground inline" />}
                              </p>
                              <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest opacity-60">
                                {c.role || "member"}
                              </p>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-6 opacity-60">
                      {t("communities_feed.no_joined")}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </aside>

          {/* Main Feed */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 animate-slide-down">
              <div>
                <h1 className="text-4xl font-black tracking-tighter flex items-center gap-3">
                  <div className="p-2 bg-primary/20 rounded-2xl">
                    <Users className="h-10 w-10 text-primary" />
                  </div>
                  {t("communities_feed.header_title")}
                </h1>
                <p className="text-muted-foreground mt-2 font-medium text-lg leading-relaxed">{t("communities_feed.header_desc")}</p>
              </div>
              <Link href="/create-community">
                <Button size="lg" className="rounded-2xl px-8 shadow-xl shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-1 transition-all active:scale-95">
                  <Plus className="h-5 w-5 mr-3" />
                  {t("communities_feed.create_button")}
                </Button>
              </Link>
            </div>

            {/* Feed Content Area */}
            <div className="relative min-h-[400px]">
              {postsLoading ? (
                <div className="animate-fade-in">
                  <SkeletonFeed />
                </div>
              ) : postsError ? (
                <div className="animate-fade-scale">
                  <ErrorState 
                    message={(postsError as Error).message} 
                    retry={() => queryClient.invalidateQueries({ queryKey: ["/api/feed/communities"] })}
                  />
                </div>
              ) : posts?.length === 0 ? (
                <div className="text-center py-20 px-6 border border-none rounded-3xl bg-muted/10 backdrop-blur-md animate-fade-scale">
                  <Users className="h-20 w-20 mx-auto text-muted-foreground mb-6 opacity-20" />
                  <h2 className="text-2xl font-black tracking-tight mb-2">{t("communities_feed.no_posts")}</h2>
                  <p className="text-muted-foreground mb-8 max-w-sm mx-auto font-medium">
                    {t("communities_feed.no_posts_desc")}
                  </p>
                  <div className="flex justify-center gap-4">
                    <Link href="/create-community">
                      <Button variant="outline" className="rounded-xl px-10 hover:bg-muted active:scale-95 transition-all">
                        {t("communities_feed.join_suggestion")}
                      </Button>
                    </Link>
                  </div>
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
      </main>
    </PageTransition>
  );
}
