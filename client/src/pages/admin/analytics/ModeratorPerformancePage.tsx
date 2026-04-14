import { useTranslation } from "react-i18next";
import { useModeratorLeaderboard, useTeamOverview, useTriggerSnapshot } from "@/hooks/use-moderator-performance";
import { KPICard } from "@/components/analytics/KPICard";
import { 
    ShieldCheck, 
    TicketCheck, 
    MessageSquare, 
    Clock, 
    RefreshCcw,
    TrendingUp,
    Award,
    AlertCircle,
    BarChart2,
    Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { format } from "date-fns";

export default function ModeratorPerformancePage() {
    const { t } = useTranslation();
    const { toast } = useToast();
    const [period, setPeriod] = useState<'today' | '7d' | '30d'>('7d');
    const [sortBy, setSortBy] = useState('score');
    
    const { data: leaderboard, isLoading: loadingLeaderboard } = useModeratorLeaderboard(period, sortBy);
    const { data: teamOverview, isLoading: loadingOverview } = useTeamOverview();
    const triggerSnapshot = useTriggerSnapshot();

    const handleRecompute = async () => {
        try {
            await triggerSnapshot.mutateAsync();
            toast({
                title: t("modPerf.snapshot_success", "Snapshot Completed"),
                description: t("modPerf.snapshot_success_desc", "Performance metrics have been updated for today."),
            });
        } catch (error) {
            toast({
                title: t("modPerf.snapshot_error", "Error"),
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
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">{t("modPerf.title", "Moderator Performance Audit")}</h1>
                        <p className="text-muted-foreground">{t("modPerf.subtitle", "Audit moderator efficiency, response times, and incident resolution.")}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={handleRecompute} 
                            disabled={triggerSnapshot.isPending}
                        >
                            <RefreshCcw className={triggerSnapshot.isPending ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
                            {t("modPerf.sync_now", "Recalculate Now")}
                        </Button>
                    </div>
                </div>

                {/* Team KPIs */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <KPICard 
                        title={t("modPerf.reports_resolved", "Reports Resolved")} 
                        value={teamOverview?.reportsHandledToday?.toString() || "0"} 
                        icon={ShieldCheck}
                        trend={{ value: Number(teamOverview?.reportsTrend || 0), isPositive: Number(teamOverview?.reportsTrend || 0) > 0 }}
                        loading={loadingOverview}
                    />
                    <KPICard 
                        title={t("modPerf.tickets_solved", "Tickets Solved")} 
                        value={teamOverview?.ticketsResolvedToday?.toString() || "0"} 
                        icon={TicketCheck}
                        trend={{ value: Number(teamOverview?.ticketsTrend || 0), isPositive: Number(teamOverview?.ticketsTrend || 0) > 0 }}
                        loading={loadingOverview}
                    />
                    <KPICard 
                        title={t("modPerf.avg_response", "Avg Response")} 
                        value={formatTime(teamOverview?.avgTicketResponseSeconds || 0)} 
                        icon={Clock}
                        description={t("modPerf.global_avg", "Global platform average")}
                        loading={loadingOverview}
                    />
                    <KPICard 
                        title={t("modPerf.pending_work", "Open Queue")} 
                        value={( (teamOverview?.openReports || 0) + (teamOverview?.openTickets || 0) ).toString()} 
                        icon={AlertCircle}
                        description={`${teamOverview?.openReports || 0} Reports, ${teamOverview?.openTickets || 0} Tickets`}
                        loading={loadingOverview}
                    />
                </div>

                <div className="grid gap-4 md:grid-cols-7">
                    {/* Leaderboard */}
                    <Card className="md:col-span-5">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0">
                            <div>
                                <CardTitle className="text-xl">{t("modPerf.leaderboard", "Moderator Leaderboard")}</CardTitle>
                                <CardDescription>{t("modPerf.leaderboard_desc", "Ranking based on weighted performance score.")}</CardDescription>
                            </div>
                            <div className="flex gap-2">
                                <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
                                    <SelectTrigger className="w-[120px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="today">{t("modPerf.today", "Today")}</SelectItem>
                                        <SelectItem value="7d">{t("modPerf.7d", "Last 7 Days")}</SelectItem>
                                        <SelectItem value="30d">{t("modPerf.30d", "Last 30 Days")}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[50px]">{t("modPerf.rank", "Rank")}</TableHead>
                                        <TableHead>{t("modPerf.moderator", "Moderator")}</TableHead>
                                        <TableHead className="text-right">{t("modPerf.reports", "Reports")}</TableHead>
                                        <TableHead className="text-right">{t("modPerf.tickets", "Tickets")}</TableHead>
                                        <TableHead className="text-right">{t("modPerf.avg_response_short", "Avg Resp.")}</TableHead>
                                        <TableHead className="text-right font-bold">{t("modPerf.score", "Score")}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loadingLeaderboard ? (
                                        Array.from({ length: 5 }).map((_, i) => (
                                            <TableRow key={i}>
                                                <TableCell colSpan={6} className="h-12 animate-pulse bg-muted/50" />
                                            </TableRow>
                                        ))
                                    ) : leaderboard?.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                                                {t("modPerf.no_data", "No activity recorded for this period.")}
                                            </TableCell>
                                        </TableRow>
                                    ) : leaderboard?.map((entry: any, index: number) => (
                                        <TableRow key={entry.moderatorId}>
                                            <TableCell className="font-medium">
                                                {index === 0 ? <Award className="h-5 w-5 text-yellow-500" /> : index + 1}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <Avatar className="h-8 w-8">
                                                        <AvatarFallback>{entry.moderatorUsername.slice(0, 2).toUpperCase()}</AvatarFallback>
                                                    </Avatar>
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold text-sm">{entry.moderatorUsername}</span>
                                                        <Badge variant="outline" className="text-[10px] h-4 w-fit px-1 uppercase leading-none">
                                                            {entry.moderatorRole}
                                                        </Badge>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">{entry.totalReportsHandled}</TableCell>
                                            <TableCell className="text-right">{entry.totalTicketsResolved}</TableCell>
                                            <TableCell className="text-right">{formatTime(entry.avgTicketResponseS)}</TableCell>
                                            <TableCell className="text-right font-mono font-bold text-primary">
                                                {Math.round(entry.totalScore)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    {/* Weighting Info */}
                    <Card className="md:col-span-2">
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <TrendingUp className="h-5 w-5 text-primary" />
                                {t("modPerf.scoring_logic", "Audit Scoring")}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span>{t("modPerf.weight_report", "Report Resolution")}</span>
                                    <span className="font-bold text-primary">+3 pts</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span>{t("modPerf.weight_ticket", "Ticket Solved")}</span>
                                    <span className="font-bold text-primary">+5 pts</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span>{t("modPerf.weight_comment", "Ticket Reply")}</span>
                                    <span className="font-bold text-primary">+1 pt</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span>{t("modPerf.weight_response", "Fast Response (<2h)")}</span>
                                    <span className="font-bold text-primary">+10 pts</span>
                                </div>
                            </div>
                            
                            <div className="p-3 bg-muted rounded-lg text-xs text-muted-foreground border">
                                <BarChart2 className="h-4 w-4 mb-1 inline mr-2 text-primary" />
                                {t("modPerf.scoring_hint", "Scores are recalculated daily. Weights are optimized to prioritize resolution speed and ticket quality.")}
                            </div>

                            <div className="pt-4 border-t space-y-4">
                                <h4 className="text-sm font-semibold">{t("modPerf.team_stats", "Team Stats (30d)")}</h4>
                                <div className="space-y-1">
                                    <div className="flex justify-between text-xs mb-1 text-muted-foreground">
                                        <span>{t("modPerf.reports_efficiency", "Report Efficiency")}</span>
                                        <span>88%</span>
                                    </div>
                                    <div className="h-1 w-full bg-secondary rounded-full overflow-hidden">
                                        <div className="h-full bg-emerald-500 w-[88%]" />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between text-xs mb-1 text-muted-foreground">
                                        <span>{t("modPerf.ticket_sla", "Ticket SLA (D1)")}</span>
                                        <span>92%</span>
                                    </div>
                                    <div className="h-1 w-full bg-secondary rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-500 w-[92%]" />
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
    );
}
