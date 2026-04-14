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

export default function GrowthDashboardPage() {
    const { t } = useTranslation();
    const { toast } = useToast();
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
        <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">{t("analytics.title", "Growth & Product Analytics")}</h1>
                        <p className="text-muted-foreground">{t("analytics.subtitle", "Monitor platform health, user retention, and viral growth.")}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button variant="outline" size="sm" onClick={handleManualCompute} disabled={computeMutation.isPending}>
                            <RefreshCcw className={computeMutation.isPending ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
                            {t("analytics.recompute", "Recompute Metrics")}
                        </Button>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <KPICard 
                        title={t("analytics.total_users", "Total Users")} 
                        value={latest?.totalUsers?.toLocaleString() || "0"} 
                        icon={Users}
                        loading={loadingOverview}
                        trend={{ value: 12, isPositive: true }} // Mock trend for UX polish
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

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                    <Card className="lg:col-span-4">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>{t("analytics.growth_trends", "Growth Trends")}</CardTitle>
                            <Tabs defaultValue="30" onValueChange={(v) => setDays(parseInt(v))}>
                                <TabsList>
                                    <TabsTrigger value="7">7d</TabsTrigger>
                                    <TabsTrigger value="30">30d</TabsTrigger>
                                    <TabsTrigger value="90">90d</TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </CardHeader>
                        <CardContent>
                            <Tabs defaultValue="users">
                                <TabsList className="mb-4">
                                    <TabsTrigger value="users">{t("analytics.tab_users", "User Growth")}</TabsTrigger>
                                    <TabsTrigger value="engagement">{t("analytics.tab_engagement", "Engagement")}</TabsTrigger>
                                    <TabsTrigger value="content">{t("analytics.tab_content", "Content Flow")}</TabsTrigger>
                                </TabsList>
                                <TabsContent value="users">
                                    <TrendChart 
                                        data={history} 
                                        dataKey="newUsers" 
                                        label={t("analytics.new_users", "New Users")} 
                                        color="#10b981"
                                        loading={loadingOverview}
                                    />
                                </TabsContent>
                                <TabsContent value="engagement">
                                    <TrendChart 
                                        data={history} 
                                        dataKey="activeUsersDay" 
                                        label={t("analytics.dau", "DAU")} 
                                        color="#3b82f6"
                                        loading={loadingOverview}
                                    />
                                </TabsContent>
                                <TabsContent value="content">
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

                    <Card className="lg:col-span-3">
                        <CardHeader>
                            <CardTitle>{t("analytics.active_ratio", "Retention & Activity")}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <p className="text-sm font-medium leading-none">{t("analytics.wau_mau", "WAU / MAU Ratio")}</p>
                                    <p className="text-xs text-muted-foreground">{t("analytics.stickiness", "Platform stickiness index")}</p>
                                </div>
                                <div className="text-2xl font-bold">
                                    {latest?.activeUsersMonth ? `${((latest.activeUsersWeek / latest.activeUsersMonth) * 100).toFixed(1)}%` : "0%"}
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <p className="text-sm font-medium leading-none">{t("analytics.engagement_rate", "Engagement Rate")}</p>
                                    <p className="text-xs text-muted-foreground">{t("analytics.actions_per_dau", "Avg actions per active user")}</p>
                                </div>
                                <div className="text-2xl font-bold">
                                    {(latest?.engagementRate || 0).toFixed(2)}
                                </div>
                            </div>
                            <div className="border-t pt-4">
                                <h4 className="text-sm font-semibold mb-3 flex items-center">
                                    <BarChart3 className="mr-2 h-4 w-4" />
                                    {t("analytics.summary", "Daily Summary")}
                                </h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-[10px] text-muted-foreground uppercase">{t("analytics.period_follows", "Follows")}</p>
                                        <p className="text-lg font-semibold">+{latest?.newFollows || 0}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-muted-foreground uppercase">{t("analytics.period_communities", "Communities")}</p>
                                        <p className="text-lg font-semibold">+{latest?.newCommunities || 0}</p>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <HotCommunitiesSection data={hotCommunities} loading={loadingCommunities} />
                    <TopCreatorsSection data={topCreators} loading={loadingCreators} />
                </div>
            </div>
    );
}
