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
import { PageHeader } from "@/components/layout/page-header";
import { AlertTriangle } from "lucide-react";

export default function GrowthDashboardPage() {
    const { t } = useTranslation();
    const { toast } = useToast();
    const { hasPermission } = useAuth();
    
    if (!hasPermission("analytics")) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                <div className="ov-cut-2 flex h-16 w-16 items-center justify-center bg-destructive/10">
                    <AlertTriangle className="h-8 w-8 text-destructive" />
                </div>
                <div className="text-center">
                    <h2 className="font-display text-xl font-semibold">Access Restricted</h2>
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
            <PageHeader
                eyebrow={t("analytics.eyebrow", "Admin / Analytics")}
                title={t("analytics.title", "Growth & Product Analytics")}
                description={t("analytics.subtitle", "Monitor platform health, user retention, and viral growth.")}
                actions={
                    <Button
                        variant="outline"
                        onClick={handleManualCompute}
                        disabled={computeMutation.isPending}
                    >
                        <RefreshCcw className={cn("h-4 w-4", computeMutation.isPending && "animate-spin")} />
                        {t("analytics.recompute", "Recompute Metrics")}
                    </Button>
                }
            />

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
                <Card className="xl:col-span-4 overflow-hidden">
                    <CardHeader className="ov-rule flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-0 pb-5 gap-4">
                        <CardTitle className="text-lg">{t("analytics.growth_trends", "Growth Trends")}</CardTitle>
                        <Tabs defaultValue="30" onValueChange={(v) => setDays(parseInt(v))} className="w-full sm:w-auto">
                            <TabsList className="w-full">
                                <TabsTrigger value="7" className="flex-1 px-4 font-data text-xs">7d</TabsTrigger>
                                <TabsTrigger value="30" className="flex-1 px-4 font-data text-xs">30d</TabsTrigger>
                                <TabsTrigger value="90" className="flex-1 px-4 font-data text-xs">90d</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <Tabs defaultValue="users" className="space-y-6">
                            <TabsList className="w-full sm:w-auto">
                                <TabsTrigger value="users" className="flex-1 sm:flex-none px-4">{t("analytics.tab_users", "User Growth")}</TabsTrigger>
                                <TabsTrigger value="engagement" className="flex-1 sm:flex-none px-4">{t("analytics.tab_engagement", "Engagement")}</TabsTrigger>
                                <TabsTrigger value="content" className="flex-1 sm:flex-none px-4">{t("analytics.tab_content", "Content Flow")}</TabsTrigger>
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
                                    color="hsl(var(--chart-2))"
                                    loading={loadingOverview}
                                />
                            </TabsContent>
                            <TabsContent value="content" className="mt-0">
                                <TrendChart 
                                    data={history} 
                                    dataKey="newPosts" 
                                    label={t("analytics.new_posts", "New Posts")} 
                                    color="hsl(var(--chart-1))"
                                    loading={loadingOverview}
                                />
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>

                <Card className="xl:col-span-3 overflow-hidden">
                    <CardHeader className="ov-rule pb-5">
                        <CardTitle className="text-lg">{t("analytics.active_ratio", "Retention & Activity")}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6 pt-6">
                        <div className="ov-panel flex items-center justify-between gap-4 p-4">
                            <div className="space-y-1">
                                <p className="text-sm font-semibold">{t("analytics.wau_mau", "WAU / MAU Ratio")}</p>
                                <p className="text-xs text-muted-foreground">{t("analytics.stickiness", "Platform stickiness index")}</p>
                            </div>
                            <div className="ov-data text-3xl font-semibold text-primary">
                                {latest?.activeUsersMonth ? `${((latest.activeUsersWeek / latest.activeUsersMonth) * 100).toFixed(1)}%` : "0%"}
                            </div>
                        </div>
                        <div className="ov-panel flex items-center justify-between gap-4 p-4">
                            <div className="space-y-1">
                                <p className="text-sm font-semibold">{t("analytics.engagement_rate", "Engagement Rate")}</p>
                                <p className="text-xs text-muted-foreground">{t("analytics.actions_per_dau", "Avg actions per active user")}</p>
                            </div>
                            <div className="ov-data text-3xl font-semibold text-primary">
                                {(latest?.engagementRate || 0).toFixed(2)}
                            </div>
                        </div>
                        <div className="border-t border-border pt-6">
                            <h4 className="ov-label mb-5 flex items-center">
                                <BarChart3 className="mr-2 h-4 w-4" />
                                {t("analytics.summary", "Daily Summary")}
                            </h4>
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-1">
                                    <p className="ov-label">{t("analytics.period_follows", "Follows")}</p>
                                    <p className="ov-data text-2xl font-semibold">+{latest?.newFollows || 0}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="ov-label">{t("analytics.period_communities", "Communities")}</p>
                                    <p className="ov-data text-2xl font-semibold text-primary">+{latest?.newCommunities || 0}</p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
                <HotCommunitiesSection data={hotCommunities} loading={loadingCommunities} />
                <TopCreatorsSection data={topCreators} loading={loadingCreators} />
            </div>
        </div>
    );
}
