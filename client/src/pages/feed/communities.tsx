import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PostCard } from "@/components/post/post-card";
import type { PostWithAuthor } from "@shared/types";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Users, Search, Hash } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/ui/error-state";
import { useTranslation } from "react-i18next";

interface Community {
  id: number;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  creatorId: number;
  role?: string;
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
    <>
      <Navbar />
      <main className="container mx-auto px-4 pt-24 pb-12">
        <div className="flex gap-6">
          {/* Left Sidebar - My Communities & Search */}
          <aside className="hidden lg:block w-72 flex-shrink-0">
            <div className="sticky top-24 space-y-4">
              {/* Search Communities */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Search className="h-4 w-4" />
                    {t("communities_feed.search_title")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <Input
                    placeholder={t("communities_feed.search_placeholder")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9"
                  />
                  {/* Search Results */}
                  {filteredCommunities && filteredCommunities.length > 0 && (
                    <div className="mt-3 space-y-1 max-h-48 overflow-y-auto">
                      {filteredCommunities.map((c) => (
                        <Link key={c.id} href={`/c/${c.slug}`}>
                          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent cursor-pointer transition-colors text-sm">
                            <Hash className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="truncate">{c.name}</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                  {filteredCommunities && filteredCommunities.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {t("communities_feed.no_results")}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* My Communities */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      {t("communities_feed.my_communities")}
                    </CardTitle>
                    <Button variant="ghost" size="icon" className="h-7 w-7" asChild aria-label="Create community">
                      <Link href="/create-community">
                        <Plus className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {communitiesLoading ? (
                    <Spinner size="sm" className="py-4" />
                  ) : myCommunities && myCommunities.length > 0 ? (
                    <div className="space-y-1">
                      {myCommunities.map((c) => (
                        <Link key={c.id} href={`/c/${c.slug}`}>
                          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent cursor-pointer transition-colors">
                            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-semibold text-primary">
                                {c.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{c.name}</p>
                              <p className="text-xs text-muted-foreground capitalize">
                                {c.role || "member"}
                              </p>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-3">
                      {t("communities_feed.no_joined")}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </aside>

          {/* Main Feed */}
          <div className="flex-1 min-w-0 max-w-3xl">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div>
                <h1 className="text-3xl font-bold flex items-center gap-2">
                  <Users className="h-8 w-8 text-primary" />
                  {t("communities_feed.header_title")}
                </h1>
                <p className="text-muted-foreground mt-1">{t("communities_feed.header_desc")}</p>
              </div>
              <Button asChild>
                <Link href="/create-community">
                  <Plus className="h-4 w-4 mr-2" />
                  {t("communities_feed.create_button")}
                </Link>
              </Button>
            </div>

            {/* Mobile search (visible on small screens) */}
            <div className="lg:hidden mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("communities_feed.search_placeholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              {filteredCommunities && filteredCommunities.length > 0 && (
                <div className="mt-2 border rounded-md p-2 space-y-1 max-h-48 overflow-y-auto">
                  {filteredCommunities.map((c) => (
                    <Link key={c.id} href={`/c/${c.slug}`}>
                      <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent cursor-pointer text-sm">
                        <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="truncate">{c.name}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Feed Content */}
            {postsLoading ? (
              <Spinner size="lg" className="p-8" />
            ) : postsError ? (
              <ErrorState message={(postsError as Error).message} />
            ) : posts?.length === 0 ? (
              <div className="text-center py-12 border rounded-lg bg-muted/10">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">{t("communities_feed.no_posts")}</h2>
                <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                  {t("communities_feed.no_posts_desc")}
                </p>
                <div className="flex justify-center gap-4">
                  <Button asChild variant="outline">
                    <Link href="/create-community">{t("communities_feed.join_suggestion")}</Link>
                  </Button>
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
      </main>
    </>
  );
}
