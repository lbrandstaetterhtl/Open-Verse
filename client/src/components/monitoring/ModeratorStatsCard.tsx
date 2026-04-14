import { useTeamOverview } from "@/hooks/use-moderator-performance";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck, TicketCheck, TrendingUp, Clock, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";

export function ModeratorStatsCard() {
    const { t } = useTranslation();
    const { data: team, isLoading } = useTeamOverview();

    const formatTime = (seconds: number) => {
        if (!seconds) return "-";
        if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
        return `${(seconds / 3600).toFixed(1)}h`;
    };

    if (isLoading) return <Skeleton className="h-24 w-full" />;

    return (
        <Card className="overflow-hidden border-none bg-primary/5">
            <CardContent className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4 border-r pr-6 last:border-0 grow">
                        <div className="h-10 w-10 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-600">
                            <ShieldCheck className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{t("modPerf.reports_today", "Reports Handled")}</p>
                            <p className="text-xl font-bold">{team?.reportsHandledToday || 0}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 border-r pr-6 last:border-0 grow">
                        <div className="h-10 w-10 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-600">
                            <TicketCheck className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{t("modPerf.tickets_today", "Tickets Resolved")}</p>
                            <p className="text-xl font-bold">{team?.ticketsResolvedToday || 0}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 border-r pr-6 last:border-0 grow">
                        <div className="h-10 w-10 bg-purple-500/10 rounded-full flex items-center justify-center text-purple-600">
                            <Clock className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{t("modPerf.resp_time", "Avg Response")}</p>
                            <p className="text-xl font-bold">{formatTime(team?.avgTicketResponseSeconds || 0)}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 grow">
                        <div className="h-10 w-10 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-600">
                            <TrendingUp className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{t("modPerf.audit_score", "Audit Score")}</p>
                            <div className="flex items-center gap-2">
                                <p className="text-xl font-bold">{(team?.reportsHandledToday || 0) * 3 + (team?.ticketsResolvedToday || 0) * 5}</p>
                                {Number(team?.reportsTrend || 0) > 0 && (
                                    <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-200 bg-emerald-50 h-4">
                                        +{team?.reportsTrend}%
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

import { Badge } from "@/components/ui/badge";
