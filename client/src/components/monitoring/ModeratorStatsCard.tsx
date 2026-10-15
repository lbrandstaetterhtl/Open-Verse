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
        <Card>
            <CardContent className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4 border-r border-border pr-6 last:border-0 grow">
                        <div className="ov-cut h-10 w-10 shrink-0 bg-primary/10 flex items-center justify-center text-primary">
                            <ShieldCheck className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="ov-label">{t("modPerf.reports_today", "Reports Handled")}</p>
                            <p className="ov-data text-xl font-semibold">{team?.reportsHandledToday || 0}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 border-r border-border pr-6 last:border-0 grow">
                        <div className="ov-cut h-10 w-10 shrink-0 bg-primary/10 flex items-center justify-center text-primary">
                            <TicketCheck className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="ov-label">{t("modPerf.tickets_today", "Tickets Resolved")}</p>
                            <p className="ov-data text-xl font-semibold">{team?.ticketsResolvedToday || 0}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 border-r border-border pr-6 last:border-0 grow">
                        <div className="ov-cut h-10 w-10 shrink-0 bg-muted flex items-center justify-center text-muted-foreground">
                            <Clock className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="ov-label">{t("modPerf.resp_time", "Avg Response")}</p>
                            <p className="ov-data text-xl font-semibold">{formatTime(team?.avgTicketResponseSeconds || 0)}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 grow">
                        <div className="ov-cut h-10 w-10 shrink-0 bg-star/10 flex items-center justify-center text-star">
                            <TrendingUp className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="ov-label">{t("modPerf.audit_score", "Audit Score")}</p>
                            <div className="flex items-center gap-2">
                                <p className="ov-data text-xl font-semibold">{(team?.reportsHandledToday || 0) * 3 + (team?.ticketsResolvedToday || 0) * 5}</p>
                                {Number(team?.reportsTrend || 0) > 0 && (
                                    <span className="ov-chip ov-chip-success ov-data h-5 px-1.5">
                                        +{team?.reportsTrend}%
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
