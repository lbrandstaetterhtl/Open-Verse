import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Community} from "@shared/schema";
import { Post } from "@shared/schema";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PostCard } from "@/components/post/post-card";
import type { PostWithAuthor } from "@shared/types";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Users,
  UserPlus,
  UserMinus,
  PlusCircle,
  Flame,
  Clock,
  TrendingUp,
  Loader2,
  ShieldAlert,
} from "lucide-react";
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

  if (isLoadingCommunity) {
    return (
      <div className="w-full px-4 md:px-8 py-6 md:py-10">
        <Skeleton className="h-64 w-full rounded-[2.5rem] mb-10" />
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
          <div className="xl:col-span-8 space-y-8">
            <Skeleton className="h-64 w-full rounded-[2rem]" />
            <Skeleton className="h-64 w-full rounded-[2rem]" />
          </div>
          <div className="xl:col-span-4">
            <Skeleton className="h-96 w-full rounded-[2rem]" />
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
            <Button variant="outline" className="mt-8 rounded-xl font-bold uppercase tracking-widest text-xs">
              {t("community.page.back_to_communities")}
            </Button>
          </Link>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen">
      <main className="w-full px-4 md:px-8 py-6 md:py-10">
        {/* Community Hero Section */}
        <div className="relative group rounded-[2.5rem] overflow-hidden mb-10 shadow-2xl shadow-black/10 border border-white/5 bg-card/50 backdrop-blur-xl">
          {community.imageUrl && (
            <div className="absolute inset-0 h-full w-full">
              <img
                src={community.imageUrl}
                alt={community.name}
                className="w-full h-full object-cover opacity-30 group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
            </div>
          )}
          
          <div className="relative p-6 md:p-12">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-8">
              <div className="flex-1 space-y-6">
                <div className="flex items-center gap-6">
                  <div className="h-20 w-20 md:h-24 md:w-24 rounded-[2rem] bg-primary/20 backdrop-blur-2xl flex items-center justify-center border border-primary/20 shadow-xl shadow-primary/10 group-hover:rotate-3 transition-transform">
                    <span className="text-4xl font-black text-primary italic italic-primary">
                      {community.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase italic italic-primary leading-tight">
                      {community.name}
                    </h1>
                    {community.memberInfo?.role && (
                      <Badge className="mt-2 bg-primary/20 text-primary hover:bg-primary/30 border-none font-black text-[10px] uppercase tracking-widest px-3 h-6">
                        {community.memberInfo.role}
                      </Badge>
                    )}
                  </div>
                </div>
                
                {community.description && (
                  <p className="text-base md:text-lg text-muted-foreground font-medium leading-relaxed max-w-2xl">
                    {community.description}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {isMember && (
                  <Link href={`/post/${postLinkCategory}?communityId=${community.id}`}>
                    <Button className="h-14 px-8 rounded-2xl shadow-xl shadow-primary/20 gap-3 font-black uppercase tracking-widest text-xs">
                      <PlusCircle className="h-5 w-5 stroke-[3px]" />
                      {t("community.page.create_post")}
                    </Button>
                  </Link>
                )}
                {(community?.memberInfo?.role === "owner" || community?.memberInfo?.role === "moderator") && (
                  <Link href="/mod-panel">
                    <Button variant="outline" className="h-14 px-8 rounded-2xl border-2 gap-3 font-black uppercase tracking-widest text-xs">
                      <ShieldAlert className="h-5 w-5" />
                      {t("community.page.manage_button")}
                    </Button>
                  </Link>
                )}
                {isMember ? (
                  <Button
                    variant={isOwner ? "secondary" : "destructive"}
                    onClick={() => leaveMutation.mutate()}
                    disabled={leaveMutation.isPending || isOwner}
                    className="h-14 px-8 rounded-2xl gap-3 font-black uppercase tracking-widest text-xs"
                  >
                    {leaveMutation.isPending ? (
                      <Loader2 className="animate-spin h-5 w-5" />
                    ) : (
                      <UserMinus className="h-5 w-5" />
                    )}
                    {isOwner ? t("community.page.owner_badge") : t("community.page.leave_button")}
                  </Button>
                ) : (
                  <Button 
                    onClick={() => joinMutation.mutate()} 
                    disabled={joinMutation.isPending}
                    className="h-14 px-10 rounded-2xl shadow-xl shadow-primary/20 gap-3 font-black uppercase tracking-widest text-xs"
                  >
                    {joinMutation.isPending ? (
                      <Loader2 className="animate-spin h-5 w-5" />
                    ) : (
                      <UserPlus className="h-5 w-5 stroke-[3px]" />
                    )}
                    {community.isPrivate ? t("community.page.request_join") : t("community.page.join_button")}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Filters and Sort */}
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 mb-10 bg-muted/20 p-4 rounded-[2rem] border border-white/5">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar w-full xl:w-auto">
            {(() => {
              const allowed = community.allowedCategories?.split(",").map((c) => c.trim()) || [
                "news",
                "entertainment",
                "discussion",
              ];
              const tabs = [
                { id: "all", label: t("community.page.tabs.all") },
                ...allowed.map((c) => ({ id: c, label: t(`community.page.tabs.${c}` as any) })),
              ];

              return tabs.map((tab) => (
                <Button
                  key={tab.id}
                  variant={selectedCategory === tab.id ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setSelectedCategory(tab.id)}
                  className="whitespace-nowrap rounded-xl font-black text-[10px] uppercase tracking-widest h-10 px-6"
                >
                  {tab.label}
                </Button>
              ));
            })()}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {sortButtons.map(({ mode, icon: Icon, label }) => (
              <Button
                key={mode}
                variant={sortMode === mode ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setSortMode(mode)}
                className="flex-1 sm:flex-none flex items-center gap-2 rounded-xl font-black text-[10px] uppercase tracking-widest h-10 px-6"
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
          {/* Main Feed */}
          <div className="xl:col-span-8 space-y-8">
            {isLoadingPosts ? (
              <div className="space-y-6">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-64 w-full rounded-[2rem]" />
                ))}
              </div>
            ) : sortedPosts.length > 0 ? (
              <div className="space-y-8">
                {sortedPosts.map((post) => <PostCard key={post.id} post={post} />)}
              </div>
            ) : (
              <div className="p-20 text-center rounded-[3rem] bg-white/5 border border-dashed border-white/10">
                <Users className="h-20 w-20 mx-auto text-muted-foreground/10 mb-6" />
                <h3 className="text-2xl font-black uppercase tracking-tighter mb-4">{t("community.page.empty_posts")}</h3>
                <p className="text-muted-foreground font-medium mb-8 max-w-xs mx-auto">{t("community.page.empty_posts_desc")}</p>
                {isMember && (
                  <Link href={`/post/${postLinkCategory}?communityId=${community.id}`}>
                    <Button className="h-12 px-8 rounded-xl font-black uppercase tracking-widest text-[10px]">
                      {t("community.page.create_post")}
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="xl:col-span-4 space-y-6">
            <Card className="rounded-[2.5rem] bg-card/50 backdrop-blur-xl border-white/10 shadow-2xl shadow-black/5 overflow-hidden">
              <CardHeader className="bg-muted/20 p-8">
                <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-primary">{t("community.page.about")}</CardTitle>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                {community.description && (
                  <p className="text-sm font-medium leading-relaxed text-muted-foreground italic">
                    "{community.description}"
                  </p>
                )}
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest">
                    <span className="text-muted-foreground">Established</span>
                    <span>{new Date(community.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest">
                    <span className="text-muted-foreground">Privacy</span>
                    <span>{community.isPrivate ? "Private" : "Public"}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {!isMember && (
              <Card className="rounded-[2.5rem] bg-primary/5 border-primary/10 shadow-xl shadow-primary/5 overflow-hidden">
                <CardContent className="p-8 text-center space-y-6">
                  <div className="p-4 rounded-2xl bg-primary/10 w-fit mx-auto">
                    <UserPlus className="h-8 w-8 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-black uppercase tracking-tighter text-lg">Join the Circle</h4>
                    <p className="text-xs font-medium text-muted-foreground leading-relaxed">
                      {t("community.page.join_prompt")}
                    </p>
                  </div>
                  <Button
                    onClick={() => joinMutation.mutate()}
                    disabled={joinMutation.isPending}
                    className="w-full h-14 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20"
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
