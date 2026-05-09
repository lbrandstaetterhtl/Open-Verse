import { useTranslation } from "react-i18next";
import { useAnalyticsOverview, useHotCommunities, useTopCreators, useComputeAnalytics } from "@/hooks/use-analytics";
import { KPICard } from "@/components/analytics/KPICard";
import { TrendChart } from "@/components/analytics/TrendChart";
import { HotCommunitiesSection } from "@/components/analytics/HotCommunitiesSection";
import { TopCreatorsSection } from "@/components/analytics/TopCreatorsSection";
import { 
    Users, 
    UserCheck, 
    FileText, 
    Zap, 
    BarChart3, 
    RefreshCcw,
    Calendar
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { AlertTriangle } from "lucide-react";

export default function GrowthDashboardPage() {
    const { t } = useTranslation();
    const { toast } = useToast();
    const { hasPermission } = useAuth();
    
    if (!hasPermission("analytics")) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                <div className="h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center">
                    <AlertTriangle className="h-8 w-8 text-red-500" />
                </div>
                <div className="text-center">
                    <h2 className="text-xl font-black uppercase italic tracking-tighter">Access Restricted</h2>
                    <p className="text-sm text-muted-foreground max-w-xs mx-auto">You do not have the required permissions to access product analytics.</p>
                </div>
            </div>
        );
    }

    const [days, setDays] = useState(30);
    const { data: overview, isLoading: loadingOverview } = useAnalyticsOverview(days);
    const { data: hotCommunities, isLoading: loadingCommunities } = useHotCommunities();
    const { data: topCreators, isLoading: loadingCreators } = useTopCreators();
    const computeMutation = useComputeAnalytics();

    const latest = overview?.latest;
    const history = overview?.history || [];

    const handleManualCompute = async () => {
        try {
            await computeMutation.mutateAsync();
            toast({
                title: t("analytics.compute_success", "Success"),
                description: t("analytics.compute_success_desc", "Latest metrics have been recalculated."),
            });
        } catch (error) {
            toast({
                title: t("analytics.compute_error", "Error"),
                variant: "destructive",
            });
        }
    };

    return (
        <div className="w-full space-y-8 animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-4xl md:text-5xl font-black tracking-tight uppercase italic italic-primary">
                        {t("analytics.title", "Growth & Product Analytics")}
                    </h1>
                    <p className="text-muted-foreground font-medium">{t("analytics.subtitle", "Monitor platform health, user retention, and viral growth.")}</p>
                </div>
                <Button 
                    variant="outline" 
                    className="h-12 px-6 rounded-xl font-bold uppercase tracking-widest text-[10px] border-2 shadow-lg shadow-black/5" 
                    onClick={handleManualCompute} 
                    disabled={computeMutation.isPending}
                >
                    <RefreshCcw className={cn("mr-2 h-4 w-4", computeMutation.isPending && "animate-spin")} />
                    {t("analytics.recompute", "Recompute Metrics")}
                </Button>
            </div>

            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                <KPICard 
                    title={t("analytics.total_users", "Total Users")} 
                    value={latest?.totalUsers?.toLocaleString() || "0"} 
                    icon={Users}
                    loading={loadingOverview}
                    trend={{ value: 12, isPositive: true }} 
                />
                <KPICard 
                    title={t("analytics.daily_active", "Daily Active")} 
                    value={latest?.activeUsersDay?.toLocaleString() || "0"} 
                    icon={UserCheck}
                    description={t("analytics.active_today", "Active in last 24h")}
                    loading={loadingOverview}
                />
                <KPICard 
                    title={t("analytics.new_posts", "New Posts")} 
                    value={latest?.newPosts?.toLocaleString() || "0"} 
                    icon={FileText}
                    loading={loadingOverview}
                />
                <KPICard 
                    title={t("analytics.retention", "D1 Retention")} 
                    value={latest?.d1Retention ? `${(latest.d1Retention * 100).toFixed(1)}%` : "0%"} 
                    icon={Zap}
                    loading={loadingOverview}
                />
            </div>

            <div className="grid gap-6 grid-cols-1 xl:grid-cols-7">
                <Card className="xl:col-span-4 border-white/5 bg-card/30 backdrop-blur-xl rounded-[2.5rem] shadow-2xl shadow-black/5 overflow-hidden">
                    <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-white/5 pb-6 gap-4">
                        <CardTitle className="text-xl font-black uppercase tracking-tight italic">{t("analytics.growth_trends", "Growth Trends")}</CardTitle>
                        <Tabs defaultValue="30" onValueChange={(v) => setDays(parseInt(v))} className="w-full sm:w-auto">
                            <TabsList className="w-full h-10 bg-muted/50 p-1 rounded-xl">
                                <TabsTrigger value="7" className="flex-1 px-4 text-[10px] font-bold uppercase tracking-widest">7d</TabsTrigger>
                                <TabsTrigger value="30" className="flex-1 px-4 text-[10px] font-bold uppercase tracking-widest">30d</TabsTrigger>
                                <TabsTrigger value="90" className="flex-1 px-4 text-[10px] font-bold uppercase tracking-widest">90d</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <Tabs defaultValue="users" className="space-y-6">
                            <TabsList className="inline-flex h-10 items-center justify-center rounded-xl bg-muted/30 p-1 text-muted-foreground w-full sm:w-auto">
                                <TabsTrigger value="users" className="flex-1 sm:flex-none px-6 text-[10px] font-bold uppercase tracking-widest">{t("analytics.tab_users", "User Growth")}</TabsTrigger>
                                <TabsTrigger value="engagement" className="flex-1 sm:flex-none px-6 text-[10px] font-bold uppercase tracking-widest">{t("analytics.tab_engagement", "Engagement")}</TabsTrigger>
                                <TabsTrigger value="content" className="flex-1 sm:flex-none px-6 text-[10px] font-bold uppercase tracking-widest">{t("analytics.tab_content", "Content Flow")}</TabsTrigger>
                            </TabsList>
                            <TabsContent value="users" className="mt-0">
                                <TrendChart 
                                    data={history} 
                                    dataKey="newUsers" 
                                    label={t("analytics.new_users", "New Users")} 
                                    color="hsl(var(--primary))"
                                    loading={loadingOverview}
                                />
                            </TabsContent>
                            <TabsContent value="engagement" className="mt-0">
                                <TrendChart 
                                    data={history} 
                                    dataKey="activeUsersDay" 
                                    label={t("analytics.dau", "DAU")} 
                                    color="#3b82f6"
                                    loading={loadingOverview}
                                />
                            </TabsContent>
                            <TabsContent value="content" className="mt-0">
                                <TrendChart 
                                    data={history} 
                                    dataKey="newPosts" 
                                    label={t("analytics.new_posts", "New Posts")} 
                                    color="#8b5cf6"
                                    loading={loadingOverview}
                                />
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>

                <Card className="xl:col-span-3 border-white/5 bg-card/30 backdrop-blur-xl rounded-[2.5rem] shadow-2xl shadow-black/5 overflow-hidden">
                    <CardHeader className="border-b border-white/5 pb-6">
                        <CardTitle className="text-xl font-black uppercase tracking-tight italic">{t("analytics.active_ratio", "Retention & Activity")}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-8 pt-8">
                        <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/20 border border-white/5">
                            <div className="space-y-1">
                                <p className="text-xs font-black uppercase tracking-widest">{t("analytics.wau_mau", "WAU / MAU Ratio")}</p>
                                <p className="text-[10px] text-muted-foreground font-medium">{t("analytics.stickiness", "Platform stickiness index")}</p>
                            </div>
                            <div className="text-3xl font-black tracking-tighter text-primary">
                                {latest?.activeUsersMonth ? `${((latest.activeUsersWeek / latest.activeUsersMonth) * 100).toFixed(1)}%` : "0%"}
                            </div>
                        </div>
                        <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/20 border border-white/5">
                            <div className="space-y-1">
                                <p className="text-xs font-black uppercase tracking-widest">{t("analytics.engagement_rate", "Engagement Rate")}</p>
                                <p className="text-[10px] text-muted-foreground font-medium">{t("analytics.actions_per_dau", "Avg actions per active user")}</p>
                            </div>
                            <div className="text-3xl font-black tracking-tighter text-primary">
                                {(latest?.engagementRate || 0).toFixed(2)}
                            </div>
                        </div>
                        <div className="pt-6 border-t border-white/5">
                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] mb-6 flex items-center text-muted-foreground">
                                <BarChart3 className="mr-2 h-4 w-4" />
                                {t("analytics.summary", "Daily Summary")}
                            </h4>
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-1">
                                    <p className="text-[9px] font-black uppercase tracking-widest opacity-50">{t("analytics.period_follows", "Follows")}</p>
                                    <p className="text-2xl font-black tracking-tighter text-emerald-500">+{latest?.newFollows || 0}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[9px] font-black uppercase tracking-widest opacity-50">{t("analytics.period_communities", "Communities")}</p>
                                    <p className="text-2xl font-black tracking-tighter text-primary">+{latest?.newCommunities || 0}</p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-8 grid-cols-1 lg:grid-cols-2">
                <HotCommunitiesSection data={hotCommunities} loading={loadingCommunities} />
                <TopCreatorsSection data={topCreators} loading={loadingCreators} />
            </div>
        </div>
    );
}
