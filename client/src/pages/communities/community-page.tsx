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
        <div className={cn(
          "relative group rounded-[3rem] overflow-hidden mb-12 shadow-2xl shadow-black/20 border border-white/10",
          !community.imageUrl && "nebula-banner min-h-[320px]"
        )}>
          {community.imageUrl ? (
            <div className="absolute inset-0 h-full w-full">
              <img
                src={community.imageUrl}
                alt={community.name}
                className="w-full h-full object-cover opacity-40 group-hover:scale-105 transition-transform duration-1000"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
            </div>
          ) : (
            <div className="absolute inset-0 starfield opacity-30" />
          )}
          
          <div className="relative p-8 md:p-14 lg:p-20">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-10">
              <div className="flex-1 space-y-8">
                <div className="flex items-center gap-8">
                  <div className="h-24 w-24 md:h-32 md:w-32 rounded-[2.5rem] bg-primary/10 backdrop-blur-3xl flex items-center justify-center border border-primary/20 shadow-2xl shadow-primary/20 group-hover:rotate-3 group-hover:scale-105 transition-all duration-500 nebula-glow">
                    <span className="text-5xl font-black text-primary italic leading-none">
                      {community.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <h1 className="text-4xl md:text-7xl font-black tracking-tighter uppercase italic bg-clip-text text-transparent bg-gradient-to-br from-foreground to-foreground/40 leading-[0.9]">
                      {community.name}
                    </h1>
                    {community.memberInfo?.role && (
                      <Badge className="bg-primary text-primary-foreground font-black text-[10px] uppercase tracking-[0.2em] px-4 h-7 rounded-full shadow-lg shadow-primary/20">
                        {community.memberInfo.role}
                      </Badge>
                    )}
                  </div>
                </div>
                
                {community.description && (
                  <p className="text-lg md:text-xl text-muted-foreground/80 font-medium leading-relaxed max-w-3xl glass-premium p-6 rounded-3xl border border-white/5">
                    {community.description}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-4">
                {isMember && (
                  <Link href={`/post/${postLinkCategory}?communityId=${community.id}`}>
                    <Button className="h-14 px-10 rounded-full shadow-2xl shadow-primary/20 gap-3 font-black uppercase tracking-widest text-[11px] transition-all hover:-translate-y-1 active:scale-95 nebula-glow">
                      <PlusCircle className="h-5 w-5 stroke-[3px]" />
                      {t("community.page.create_post")}
                    </Button>
                  </Link>
                )}
                {(community?.memberInfo?.role === "owner" || community?.memberInfo?.role === "moderator") && (
                  <Link href="/mod-panel">
                    <Button variant="outline" className="h-14 px-10 rounded-full glass-card border-border/40 gap-3 font-black uppercase tracking-widest text-[11px] transition-all hover:bg-primary/10">
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
                    className="h-14 px-10 rounded-full gap-3 font-black uppercase tracking-widest text-[11px] glass-card border-destructive/20 text-destructive hover:bg-destructive/10"
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
                    className="h-14 px-12 rounded-full shadow-2xl shadow-primary/20 gap-4 font-black uppercase tracking-widest text-[11px] transition-all hover:-translate-y-1 active:scale-95 nebula-glow"
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
            <Card className="rounded-[3rem] glass-premium border-white/5 shadow-2xl shadow-black/10 overflow-hidden group">
              <CardHeader className="bg-primary/5 p-8 border-b border-white/5">
                <CardTitle className="text-xs font-black uppercase tracking-[0.3em] text-primary/80">{t("community.page.about")}</CardTitle>
              </CardHeader>
              <CardContent className="p-10 space-y-8">
                {community.description && (
                  <p className="text-sm font-medium leading-relaxed text-muted-foreground italic opacity-80 group-hover:opacity-100 transition-opacity">
                    "{community.description}"
                  </p>
                )}
                
                <div className="space-y-5">
                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em]">
                    <span className="text-muted-foreground/60">Established</span>
                    <span className="text-primary/70">{new Date(community.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em]">
                    <span className="text-muted-foreground/60">Privacy Mode</span>
                    <span className={cn(community.isPrivate ? "text-amber-500" : "text-emerald-500")}>
                      {community.isPrivate ? "Restricted" : "Open Access"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {!isMember && (
              <Card className="rounded-[3rem] bg-gradient-to-br from-primary/10 via-accent/5 to-transparent border-primary/20 shadow-2xl shadow-primary/10 overflow-hidden relative group">
                <div className="absolute inset-0 starfield opacity-10" />
                <CardContent className="p-10 text-center space-y-8 relative z-10">
                  <div className="h-20 w-20 rounded-[2rem] bg-primary/20 mx-auto flex items-center justify-center shadow-lg shadow-primary/20 group-hover:scale-110 transition-transform duration-500">
                    <UserPlus className="h-10 w-10 text-primary" />
                  </div>
                  <div className="space-y-3">
                    <h4 className="font-black uppercase tracking-tighter text-2xl">Join the Circle</h4>
                    <p className="text-sm font-medium text-muted-foreground leading-relaxed">
                      {t("community.page.join_prompt")}
                    </p>
                  </div>
                  <Button
                    onClick={() => joinMutation.mutate()}
                    disabled={joinMutation.isPending}
                    className="w-full h-14 rounded-full font-black uppercase tracking-widest text-xs shadow-2xl shadow-primary/30 nebula-glow"
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
