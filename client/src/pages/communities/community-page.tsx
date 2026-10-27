import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Community} from "@shared/schema";
import type { Post } from "@shared/schema";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PostCard } from "@/components/post/post-card";
import type { PostWithAuthor } from "@shared/types";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Users, UserPlus, UserMinus, Plus, Flame, Clock, TrendingUp, Loader2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

type SortMode = "hot" | "new" | "top";

export default function CommunityPage() {
  const { t } = useTranslation();
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "";
  const [sortMode, setSortMode] = useState<SortMode>("hot");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const { user } = useAuth();
  const { toast } = useToast();

  const { data: community, isLoading: isLoadingCommunity } = useQuery<
    Community & { memberInfo?: { role: string } }
  >({
    queryKey: [`/api/communities/${slug}`],
    enabled: !!slug,
    queryFn: async () => {
      const res = await fetch(`/api/communities/${slug}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const { data: posts, isLoading: isLoadingPosts } = useQuery<PostWithAuthor[]>({
    queryKey: ["/api/posts", { communityId: community?.id }],
    enabled: !!community?.id,
    queryFn: async () => {
      const res = await fetch(
        `/api/posts?communityId=${community?.id}&include=author,comments,reactions,userReaction`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const joinMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/communities/${community!.id}/join`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/communities/${slug}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/communities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/moderated-communities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feed/communities"] });
      toast({
        title: t("community.page.joined_success"),
        description: t("community.page.member_of", { name: community!.name }),
      });
    },
    onError: (error: Error) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const leaveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/communities/${community!.id}/leave`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/communities/${slug}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/communities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/moderated-communities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feed/communities"] });
      toast({
        title: t("community.page.left_success"),
        description: t("community.page.left_community", { name: community!.name }),
      });
    },
    onError: (error: Error) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  // Sort posts based on mode
  const filteredPosts =
    posts?.filter((p) => selectedCategory === "all" || p.category === selectedCategory) || [];
  const sortedPosts = filteredPosts.toSorted((a, b) => {
    switch (sortMode) {
      case "new":
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case "top":
        return (b.karma || 0) - (a.karma || 0);
      case "hot":
      default: {
        // Hot = score weighted by recency
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);

        // Fallback for invalid dates
        if (isNaN(dateA.getTime())) return 1;
        if (isNaN(dateB.getTime())) return -1;

        const ageA = Math.max(0, (Date.now() - dateA.getTime()) / 3600000); // hours, non-negative
        const ageB = Math.max(0, (Date.now() - dateB.getTime()) / 3600000);

        const scoreA = (a.karma || 0) / Math.pow(ageA + 2, 1.5);
        const scoreB = (b.karma || 0) / Math.pow(ageB + 2, 1.5);

        // If scores are equal or NaN, sort by new
        if (isNaN(scoreA) || isNaN(scoreB) || scoreA === scoreB) {
          return dateB.getTime() - dateA.getTime();
        }

        return scoreB - scoreA;
      }
    }
  });

  const isMember = !!community?.memberInfo;
  const isOwner = community?.memberInfo?.role === "owner";
  const postLinkCategory = community?.type === "discussion" ? "discussions" : "news";

  const sortButtons = [
    { mode: "hot", icon: Flame, label: t("community.page.sort.hot") },
    { mode: "new", icon: Clock, label: t("community.page.sort.new") },
    { mode: "top", icon: TrendingUp, label: t("community.page.sort.top") },
  ] as const;

  if (isLoadingCommunity) {
    return (
      <div className="w-full px-4 md:px-8 py-6 md:py-10">
        <Skeleton className="h-40 w-full rounded-xl mb-10" />
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
          <div className="xl:col-span-8 space-y-8">
            <Skeleton className="h-64 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
          <div className="xl:col-span-4">
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!community) {
    return (
      <div className="w-full px-4 md:px-8 py-20 text-center">
        <EmptyState
          icon={<Users className="h-16 w-16 text-muted-foreground/20" />}
          title={t("community.page.not_found_title")}
          description={t("community.page.not_found_desc")}
        >
          <Link href="/feed/communities">
            <Button variant="outline" className="mt-8">
              {t("community.page.back_to_communities")}
            </Button>
          </Link>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen">
      <main className="w-full px-4 md:px-8 pb-6 md:pb-10">
        {/* Community cover */}
        {community.imageUrl && (
          <div className="ov-cut-2 relative mt-6 h-32 w-full overflow-hidden bg-card md:h-48">
            <img
              src={community.imageUrl}
              alt={community.name}
              className="h-full w-full object-cover"
            />
          </div>
        )}

        {/* Community header */}
        <PageHeader
          className="mb-10"
          eyebrow={
            <>
              {t("community.page.eyebrow", "Communities")} / c/{community.slug}
            </>
          }
          title={
            <span className="flex items-center gap-4">
              <span
                aria-hidden="true"
                className="ov-avatar flex h-12 w-12 shrink-0 items-center justify-center bg-primary/10 text-2xl text-primary md:h-14 md:w-14 md:text-3xl"
              >
                {community.name.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 break-words">{community.name}</span>
            </span>
          }
          description={community.description}
          actions={
            <>
              {community.memberInfo?.role && (
                <span className="ov-chip ov-chip-primary capitalize">
                  {t(`communities.roles.${community.memberInfo.role}`, { defaultValue: community.memberInfo.role })}
                </span>
              )}
              {isMember && (
                <Link href={`/post/${postLinkCategory}?communityId=${community.id}`}>
                  <Button>
                    <Plus className="h-4 w-4" />
                    {t("community.page.create_post")}
                  </Button>
                </Link>
              )}
              {(community?.memberInfo?.role === "owner" || community?.memberInfo?.role === "moderator") && (
                <Link href="/mod-panel">
                  <Button variant="outline">
                    <ShieldAlert className="h-4 w-4" />
                    {t("community.page.manage_button")}
                  </Button>
                </Link>
              )}
              {isMember ? (
                <Button
                  variant={isOwner ? "secondary" : "destructive"}
                  onClick={() => leaveMutation.mutate()}
                  disabled={leaveMutation.isPending || isOwner}
                  className="bg-transparent text-destructive ring-1 ring-inset ring-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                >
                  {leaveMutation.isPending ? (
                    <Loader2 className="animate-spin h-4 w-4" />
                  ) : (
                    <UserMinus className="h-4 w-4" />
                  )}
                  {isOwner ? t("community.page.owner_badge") : t("community.page.leave_button")}
                </Button>
              ) : (
                <Button
                  onClick={() => joinMutation.mutate()}
                  disabled={joinMutation.isPending}
                >
                  {joinMutation.isPending ? (
                    <Loader2 className="animate-spin h-4 w-4" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  {community.isPrivate ? t("community.page.request_join") : t("community.page.join_button")}
                </Button>
              )}
            </>
          }
        >
          {/* Filters and Sort */}
          <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar w-full xl:w-auto">
              {(() => {
                const allowed = community.allowedCategories?.split(",").map((c) => c.trim()) || [
                  "news",
                  "entertainment",
                  "discussion",
                ];
                const tabs = [
                  { id: "all", label: t("community.page.tabs.all") },
                  ...allowed.map((c) => ({ id: c, label: t(`community.page.tabs.${c}` as any, { defaultValue: c }) })),
                ];

                return tabs.map((tab) => (
                  <Button
                    key={tab.id}
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedCategory(tab.id)}
                    className={cn("whitespace-nowrap", selectedCategory === tab.id && "ov-tab-active")}
                  >
                    {tab.label}
                  </Button>
                ));
              })()}
            </div>

            <div className="flex items-center gap-1 w-full sm:w-auto">
              {sortButtons.map(({ mode, icon: Icon, label }) => (
                <Button
                  key={mode}
                  variant={sortMode === mode ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setSortMode(mode)}
                  className="flex-1 sm:flex-none"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </PageHeader>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
          {/* Main Feed */}
          <div className="xl:col-span-8 space-y-8">
            {isLoadingPosts ? (
              <div className="space-y-6">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-64 w-full rounded-xl" />
                ))}
              </div>
            ) : sortedPosts.length > 0 ? (
              <div className="space-y-8">
                {sortedPosts.map((post) => <PostCard key={post.id} post={post} />)}
              </div>
            ) : (
              <div className="ov-panel p-10 md:p-12 text-center">
                <Users className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="font-display text-xl font-semibold mb-2">{t("community.page.empty_posts")}</h3>
                <p className="text-muted-foreground mb-6 max-w-xs mx-auto">{t("community.page.empty_posts_desc")}</p>
                {isMember && (
                  <Link href={`/post/${postLinkCategory}?communityId=${community.id}`}>
                    <Button>
                      {t("community.page.create_post")}
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="xl:col-span-4 space-y-6">
            <Card className="overflow-hidden">
              <CardHeader className="ov-rule p-5">
                <CardTitle className="text-lg">{t("community.page.about")}</CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-5">
                {community.description && (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    "{community.description}"
                  </p>
                )}

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <span className="ov-label">{t("community.page.established", "Established")}</span>
                    <span className="ov-data text-xs text-foreground">{new Date(community.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="ov-label">{t("community.page.privacy_mode", "Privacy Mode")}</span>
                    <span className={cn("ov-chip", community.isPrivate ? "ov-chip-star" : "ov-chip-success")}>
                      {community.isPrivate ? t("community.page.restricted", "Restricted") : t("community.page.open_access", "Open Access")}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {!isMember && (
              <Card>
                <CardContent className="p-6 text-center space-y-5">
                  <div className="ov-cut-2 h-14 w-14 bg-primary/10 mx-auto flex items-center justify-center">
                    <UserPlus className="h-7 w-7 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-display text-lg font-semibold">{t("community.page.join_circle", "Join the Circle")}</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {t("community.page.join_prompt")}
                    </p>
                  </div>
                  <Button
                    onClick={() => joinMutation.mutate()}
                    disabled={joinMutation.isPending}
                    className="w-full"
                  >
                    {t("community.page.join_button")}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
