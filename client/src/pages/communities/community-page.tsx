import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Community, Post } from "@shared/schema";
import { useParams, Link } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PostCard, PostWithDetails } from "@/components/post/post-card";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Users, UserPlus, UserMinus, PlusCircle, Flame, Clock, TrendingUp, Loader2 } from "lucide-react";
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

    const { data: community, isLoading: isLoadingCommunity } = useQuery<Community & { memberInfo?: { role: string } }>({
        queryKey: [`/api/communities/${slug}`],
        enabled: !!slug,
        queryFn: async () => {
            const res = await fetch(`/api/communities/${slug}`, { credentials: "include" });
            if (!res.ok) throw new Error(await res.text());
            return res.json();
        },
    });

    const { data: posts, isLoading: isLoadingPosts } = useQuery<PostWithDetails[]>({
        queryKey: ["/api/posts", { communityId: community?.id }],
        enabled: !!community?.id,
        queryFn: async () => {
            const res = await fetch(`/api/posts?communityId=${community?.id}&include=author,comments,reactions,userReaction`, { credentials: "include" });
            if (!res.ok) throw new Error(await res.text());
            return res.json();
        }
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
            toast({ title: t('community.page.joined_success'), description: t('community.page.member_of', { name: community!.name }) });
        },
        onError: (error: Error) => {
            toast({ title: t('common.error'), description: error.message, variant: "destructive" });
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
            toast({ title: t('community.page.left_success'), description: t('community.page.left_community', { name: community!.name }) });
        },
        onError: (error: Error) => {
            toast({ title: t('common.error'), description: error.message, variant: "destructive" });
        },
    });

    // Sort posts based on mode
    const filteredPosts = posts?.filter(p => selectedCategory === "all" || p.category === selectedCategory) || [];
    const sortedPosts = filteredPosts.sort((a, b) => {
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
            <>
                <Navbar />
                <main className="container mx-auto px-4 pt-24">
                    <Skeleton className="h-48 w-full rounded-lg mb-6" />
                    <div className="space-y-4">
                        <Skeleton className="h-12 w-64" />
                        <Skeleton className="h-48 w-full" />
                        <Skeleton className="h-48 w-full" />
                    </div>
                </main>
            </>
        );
    }

    if (!community) {
        return (
            <>
                <Navbar />
                <main className="container mx-auto px-4 pt-24 text-center">
                    <Users className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                    <h1 className="text-2xl font-bold mb-2">{t('community.page.not_found_title')}</h1>
                    <p className="text-muted-foreground mb-6">{t('community.page.not_found_desc')}</p>
                    <Button asChild variant="outline">
                        <Link href="/feed/communities">{t('community.page.back_to_communities')}</Link>
                    </Button>
                </main>
            </>
        );
    }

    const isMember = !!community.memberInfo;
    const isOwner = community.memberInfo?.role === "owner";

    const sortButtons: { mode: SortMode; icon: typeof Flame; label: string }[] = [
        { mode: "hot", icon: Flame, label: t('community.page.sort.hot') },
        { mode: "new", icon: Clock, label: t('community.page.sort.new') },
        { mode: "top", icon: TrendingUp, label: t('community.page.sort.top') },
    ];

    const allowed = community.allowedCategories?.split(',').map(c => c.trim()) || ["news", "entertainment", "discussion"];
    const targetCategory = selectedCategory === "all" ? allowed[0] : selectedCategory;
    const postLinkCategory = targetCategory === "discussion" ? "discussions" : targetCategory;

    return (
        <>
            <Navbar />
            <main className="container mx-auto px-4 pt-24 pb-12">
                {/* Community Banner */}
                <div className="bg-card rounded-lg border shadow-sm mb-6 overflow-hidden">
                    {community.imageUrl && (
                        <div className="h-40 w-full bg-muted">
                            <img src={community.imageUrl} alt={community.name} className="w-full h-full object-cover" />
                        </div>
                    )}
                    <div className="p-6">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <h1 className="text-3xl font-bold flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                        <span className="text-lg font-bold text-primary">{community.name.charAt(0).toUpperCase()}</span>
                                    </div>
                                    {community.name}
                                </h1>
                                {community.description && (
                                    <p className="text-muted-foreground mt-2 ml-13">{community.description}</p>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {isMember && (
                                    <Button variant="outline" asChild>
                                        <Link href={`/post/${postLinkCategory}?communityId=${community.id}`}>
                                            <PlusCircle className="mr-2 h-4 w-4" />
                                            {t('community.page.create_post')}
                                        </Link>
                                    </Button>
                                )}
                                {isMember ? (
                                    <Button
                                        variant={isOwner ? "secondary" : "destructive"}
                                        onClick={() => leaveMutation.mutate()}
                                        disabled={leaveMutation.isPending || isOwner}
                                        size="sm"
                                    >
                                        {leaveMutation.isPending ? <Loader2 className="animate-spin h-4 w-4" /> : <UserMinus className="mr-2 h-4 w-4" />}
                                        {isOwner ? t('community.page.owner_badge') : t('community.page.leave_button')}
                                    </Button>
                                ) : (
                                    <Button onClick={() => joinMutation.mutate()} disabled={joinMutation.isPending}>
                                        {joinMutation.isPending ? <Loader2 className="animate-spin h-4 w-4" /> : <UserPlus className="mr-2 h-4 w-4" />}
                                        {t('community.page.join_button')}
                                    </Button>
                                )}
                            </div>
                        </div>
                        {community.memberInfo?.role && (
                            <div className="mt-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                                {community.memberInfo.role.charAt(0).toUpperCase() + community.memberInfo.role.slice(1)}
                            </div>
                        )}
                    </div>
                </div>

                {/* Filters and Sort */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    {/* Category Tabs */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
                        {(() => {
                            const allowed = community.allowedCategories?.split(',').map(c => c.trim()) || ["news", "entertainment", "discussion"];
                            const tabs = [
                                { id: "all", label: t('community.page.tabs.all') },
                                ...allowed.map(c => ({ id: c, label: t(`community.page.tabs.${c}` as any) }))
                            ];

                            return tabs.map(tab => (
                                <Button
                                    key={tab.id}
                                    variant={selectedCategory === tab.id ? "default" : "secondary"}
                                    size="sm"
                                    onClick={() => setSelectedCategory(tab.id)}
                                    className="whitespace-nowrap"
                                >
                                    {tab.label}
                                </Button>
                            ));
                        })()}
                    </div>

                    {/* Sort Buttons */}
                    <div className="flex items-center gap-2">
                        {sortButtons.map(({ mode, icon: Icon, label }) => (
                            <Button
                                key={mode}
                                variant={sortMode === mode ? "default" : "outline"}
                                size="sm"
                                onClick={() => setSortMode(mode)}
                                className="flex items-center gap-1.5"
                            >
                                <Icon className="h-4 w-4" />
                                {label}
                            </Button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main Feed */}
                    <div className="lg:col-span-2 space-y-4">
                        {isLoadingPosts ? (
                            <div className="space-y-4">
                                {[1, 2, 3].map((i) => (
                                    <Skeleton key={i} className="h-48 w-full rounded-lg" />
                                ))}
                            </div>
                        ) : sortedPosts.length > 0 ? (
                            sortedPosts.map((post) => (
                                <PostCard key={post.id} post={post} />
                            ))
                        ) : (
                            <div className="text-center py-16 border-2 border-dashed rounded-lg">
                                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                                <h3 className="text-lg font-semibold mb-2">{t('community.page.empty_posts')}</h3>
                                <p className="text-muted-foreground mb-4">{t('community.page.empty_posts_desc')}</p>
                                {isMember && (
                                    <Button asChild>
                                        <Link href={`/post/${postLinkCategory}?communityId=${community.id}`}>
                                            <PlusCircle className="mr-2 h-4 w-4" />
                                            {t('community.page.create_post')}
                                        </Link>
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-4">
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-medium">{t('community.page.about')}</CardTitle>
                            </CardHeader>
                            <CardContent className="text-sm text-muted-foreground space-y-2">
                                {community.description && <p>{community.description}</p>}
                                <p>{t('community.page.created')} {new Date(community.createdAt).toLocaleDateString()}</p>
                            </CardContent>
                        </Card>

                        {!isMember && (
                            <Card>
                                <CardContent className="pt-6 text-center">
                                    <p className="text-sm text-muted-foreground mb-3">
                                        {t('community.page.join_prompt')}
                                    </p>
                                    <Button onClick={() => joinMutation.mutate()} disabled={joinMutation.isPending} className="w-full">
                                        <UserPlus className="mr-2 h-4 w-4" />
                                        {t('community.page.join_button')}
                                    </Button>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </main>
        </>
    );
}
