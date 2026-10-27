import { useTranslation } from "react-i18next";
import { useModeratorLeaderboard, useTeamOverview, useTriggerSnapshot } from "@/staff/hooks/use-moderator-performance";
import { KPICard } from "@/staff/components/analytics/KPICard";
import { ShieldCheck, TicketCheck, Clock, RefreshCcw, TrendingUp, Award, AlertCircle, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { PageHeader } from "@/components/layout/page-header";

export default function ModeratorPerformancePage() {
    const { t } = useTranslation();
    const { toast } = useToast();
    const [period, setPeriod] = useState<'today' | '7d' | '30d'>('7d');
    const [sortBy, _setSortBy] = useState('score');
    
    const { data: leaderboard, isLoading: loadingLeaderboard } = useModeratorLeaderboard(period, sortBy);
    const { data: teamOverview, isLoading: loadingOverview } = useTeamOverview();
    const triggerSnapshot = useTriggerSnapshot();

    const handleRecompute = async () => {
        try {
            await triggerSnapshot.mutateAsync();
            toast({
                title: t("modPerf:snapshot_success", "Snapshot Completed"),
                description: t("modPerf:snapshot_success_desc", "Performance metrics have been updated for today."),
            });
        } catch {
            toast({
                title: t("modPerf:snapshot_error", "Error creating snapshot"),
                variant: "destructive",
            });
        }
    };

    const formatTime = (seconds: number) => {
        if (!seconds) return "-";
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
        return `${(seconds / 3600).toFixed(1)}h`;
    };

    return (
        <div className="space-y-6">
                <PageHeader
                    eyebrow={t("staff:modPerf.eyebrow", "Admin / Analytics")}
                    title={t("modPerf:title", "Moderator Performance Audit")}
                    description={t("modPerf:subtitle", "Audit moderator efficiency, response times, and incident resolution.")}
                    actions={
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRecompute}
                            disabled={triggerSnapshot.isPending}
                        >
                            <RefreshCcw className={triggerSnapshot.isPending ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
                            {t("modPerf:sync_now", "Recalculate Now")}
                        </Button>
                    }
                />

                {/* Team KPIs */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <KPICard 
                        title={t("modPerf:reports_resolved", "Reports Resolved")} 
                        value={teamOverview?.reportsHandledToday?.toString() || "0"} 
                        icon={ShieldCheck}
                        trend={{ value: Number(teamOverview?.reportsTrend || 0), isPositive: Number(teamOverview?.reportsTrend || 0) > 0 }}
                        loading={loadingOverview}
                    />
                    <KPICard 
                        title={t("modPerf:tickets_solved", "Tickets Solved")} 
                        value={teamOverview?.ticketsResolvedToday?.toString() || "0"} 
                        icon={TicketCheck}
                        trend={{ value: Number(teamOverview?.ticketsTrend || 0), isPositive: Number(teamOverview?.ticketsTrend || 0) > 0 }}
                        loading={loadingOverview}
                    />
                    <KPICard 
                        title={t("modPerf:avg_response", "Avg Response")} 
                        value={formatTime(teamOverview?.avgTicketResponseSeconds || 0)} 
                        icon={Clock}
                        description={t("modPerf:global_avg", "Global platform average")}
                        loading={loadingOverview}
                    />
                    <KPICard 
                        title={t("modPerf:pending_work", "Open Queue")} 
                        value={( (teamOverview?.openReports || 0) + (teamOverview?.openTickets || 0) ).toString()} 
                        icon={AlertCircle}
                        description={t("modPerf:open_queue_desc", { reports: teamOverview?.openReports || 0, tickets: teamOverview?.openTickets || 0, defaultValue: "{{reports}} Reports, {{tickets}} Tickets" })}
                        loading={loadingOverview}
                    />
                </div>

                <div className="grid gap-4 md:grid-cols-7">
                    {/* Leaderboard */}
                    <section className="md:col-span-5 space-y-4">
                        <div className="flex flex-wrap items-end justify-between gap-4">
                            <div>
                                <h2 className="font-display text-xl font-semibold">{t("modPerf:leaderboard", "Moderator Leaderboard")}</h2>
                                <p className="text-sm text-muted-foreground">{t("modPerf:leaderboard_desc", "Ranking based on weighted performance score.")}</p>
                            </div>
                            <div className="flex gap-2">
                                <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
                                    <SelectTrigger className="w-[120px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="today">{t("modPerf:today", "Today")}</SelectItem>
                                        <SelectItem value="7d">{t("modPerf:7d", "Last 7 Days")}</SelectItem>
                                        <SelectItem value="30d">{t("modPerf:30d", "Last 30 Days")}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <ResponsiveTable<any>
                            keyField="moderatorId"
                            columns={[
                                { 
                                    key: "rank", 
                                    label: t("modPerf:rank", "Rank"), 
                                    render: (_, index) => (
                                        <div className="ov-data font-medium">
                                            {index === 0 ? <Award className="h-5 w-5 text-star" /> : index + 1}
                                        </div>
                                    )
                                },
                                { 
                                    key: "moderator", 
                                    label: t("modPerf:moderator", "Moderator"), 
                                    render: (entry) => (
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-8 w-8">
                                                <AvatarFallback>{entry.moderatorUsername.slice(0, 2).toUpperCase()}</AvatarFallback>
                                            </Avatar>
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-sm">{entry.moderatorUsername}</span>
                                                <span className="ov-chip ov-chip-primary capitalize mt-1 h-5 w-fit px-1.5">
                                                    {entry.moderatorRole}
                                                </span>
                                            </div>
                                        </div>
                                    )
                                },
                                { key: "totalReportsHandled", label: t("modPerf:reports", "Reports"), render: (e) => <span className="ov-data">{e.totalReportsHandled}</span> },
                                { key: "totalTicketsResolved", label: t("modPerf:tickets", "Tickets"), render: (e) => <span className="ov-data">{e.totalTicketsResolved}</span> },
                                { key: "avgResponse", label: t("modPerf:avg_response_short", "Avg Resp."), render: (e) => <span className="ov-data">{formatTime(e.avgTicketResponseS)}</span> },
                                { key: "score", label: t("modPerf:score", "Score"), render: (e) => <span className="ov-data font-semibold text-primary">{Math.round(e.totalScore)}</span> }
                            ]}
                            data={leaderboard || []}
                            loading={loadingLeaderboard}
                            renderMobileCard={(entry) => (
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Avatar className="h-10 w-10">
                                            <AvatarFallback>{entry.moderatorUsername.slice(0, 2).toUpperCase()}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <p className="font-semibold text-sm">{entry.moderatorUsername}</p>
                                            <p className="ov-label">{entry.moderatorRole}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="ov-data text-lg font-semibold text-primary">{Math.round(entry.totalScore)}</p>
                                        <p className="ov-label">{t("modPerf:points", "Points")}</p>
                                    </div>
                                </div>
                            )}
                        />
                    </section>

                    {/* Weighting Info */}
                    <Card className="md:col-span-2">
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <TrendingUp className="h-5 w-5 text-primary" />
                                {t("modPerf:scoring_logic", "Audit Scoring")}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span>{t("modPerf:weight_report", "Report Resolution")}</span>
                                    <span className="ov-data font-semibold text-primary">{t("modPerf:points_plus", { value: 3, defaultValue: "+{{value}} pts" })}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span>{t("modPerf:weight_ticket", "Ticket Solved")}</span>
                                    <span className="ov-data font-semibold text-primary">{t("modPerf:points_plus", { value: 5, defaultValue: "+{{value}} pts" })}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span>{t("modPerf:weight_comment", "Ticket Reply")}</span>
                                    <span className="ov-data font-semibold text-primary">{t("modPerf:points_plus_one", "+1 pt")}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span>{t("modPerf:weight_response", "Fast Response (<2h)")}</span>
                                    <span className="ov-data font-semibold text-primary">{t("modPerf:points_plus", { value: 10, defaultValue: "+{{value}} pts" })}</span>
                                </div>
                            </div>
                            
                            <div className="p-3 bg-muted/50 rounded-sm text-xs text-muted-foreground border border-border">
                                <BarChart3 className="h-4 w-4 mb-1 inline mr-2 text-primary" />
                                {t("modPerf:scoring_hint", "Scores are recalculated daily. Weights are optimized to prioritize resolution speed and ticket quality.")}
                            </div>

                            <div className="pt-4 border-t border-border space-y-4">
                                <h4 className="ov-label">{t("modPerf:team_stats", "Team Stats (30d)")}</h4>
                                <div className="space-y-1">
                                    <div className="flex justify-between text-xs mb-1 text-muted-foreground">
                                        <span>{t("modPerf:reports_efficiency", "Report Efficiency")}</span>
                                        <span className="ov-data">88%</span>
                                    </div>
                                    <div className="h-1 w-full bg-secondary rounded-pill overflow-hidden">
                                        <div className="h-full bg-primary w-[88%]" />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between text-xs mb-1 text-muted-foreground">
                                        <span>{t("modPerf:ticket_sla", "Ticket SLA (D1)")}</span>
                                        <span className="ov-data">92%</span>
                                    </div>
                                    <div className="h-1 w-full bg-secondary rounded-pill overflow-hidden">
                                        <div className="h-full bg-primary w-[92%]" />
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
    );
}
