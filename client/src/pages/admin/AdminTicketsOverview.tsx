import { useTicketStats } from "@/hooks/use-tickets";
import TicketsPage from "@/pages/tickets/TicketsPage";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Activity, Ticket, Clock, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function AdminTicketsOverview() {
  const { t } = useTranslation();
  const { data: stats, isLoading } = useTicketStats();

  return (
    <div className="flex flex-col h-full w-full">
      <div className="container max-w-5xl mx-auto px-4 py-4">
        {isLoading ? (
          <div className="ov-panel h-24 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                <Ticket className="w-5 h-5 text-primary mb-2" />
                <span className="ov-data text-3xl font-semibold">{stats.by_status.open || 0}</span>
                <span className="ov-label mt-1">{t("admin_tickets.open", "Open")}</span>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                <AlertTriangle className="w-5 h-5 text-destructive mb-2" />
                <span className="ov-data text-3xl font-semibold text-destructive">{stats.open_critical || 0}</span>
                <span className="ov-label mt-1">{t("admin_tickets.critical_open", "Critical open")}</span>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                <Activity className="w-5 h-5 text-star mb-2" />
                <span className="ov-data text-3xl font-semibold">{stats.by_status.in_progress || 0}</span>
                <span className="ov-label mt-1">{t("admin_tickets.in_progress", "In progress")}</span>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                <Clock className="w-5 h-5 text-muted-foreground mb-2" />
                <span className="ov-data text-3xl font-semibold">{stats.avg_resolution_time_hours || 0}</span>
                <span className="ov-label mt-1">{t("admin_tickets.avg_hours_to_resolve", "Avg hrs to resolve")}</span>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
      
      {/* Re-use TicketsPage for the list, it checks if Owner and shows 'All Tickets' */}
      <div className="flex-1">
        <TicketsPage />
      </div>
    </div>
  );
}
