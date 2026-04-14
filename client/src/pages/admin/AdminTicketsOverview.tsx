import { useTicketStats } from "@/hooks/use-tickets";
import TicketsPage from "@/pages/tickets/TicketsPage";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Activity, Ticket, Clock, AlertTriangle } from "lucide-react";

export default function AdminTicketsOverview() {
  const { data: stats, isLoading } = useTicketStats();

  return (
    <div className="flex flex-col h-full w-full">
      <div className="container max-w-5xl mx-auto px-4 py-4">
        {isLoading ? (
          <div className="h-24 flex items-center justify-center border rounded-lg bg-card/50">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900 shadow-none">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                <Ticket className="w-5 h-5 text-blue-500 mb-2" />
                <span className="text-3xl font-black text-blue-700 dark:text-blue-400">{stats.by_status.open || 0}</span>
                <span className="text-xs font-semibold text-blue-600/70 mt-1 uppercase tracking-wider">Open</span>
              </CardContent>
            </Card>
            
            <Card className="bg-red-50/50 dark:bg-red-950/20 border-red-100 dark:border-red-900 shadow-none">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                <AlertTriangle className="w-5 h-5 text-red-500 mb-2" />
                <span className="text-3xl font-black text-red-700 dark:text-red-400">{stats.open_critical || 0}</span>
                <span className="text-xs font-semibold text-red-600/70 mt-1 uppercase tracking-wider">Critical Open</span>
              </CardContent>
            </Card>

            <Card className="bg-yellow-50/50 dark:bg-yellow-950/20 border-yellow-100 dark:border-yellow-900 shadow-none">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                <Activity className="w-5 h-5 text-yellow-600 mb-2" />
                <span className="text-3xl font-black text-yellow-700 dark:text-yellow-400">{stats.by_status.in_progress || 0}</span>
                <span className="text-xs font-semibold text-yellow-600/70 mt-1 uppercase tracking-wider">In Progress</span>
              </CardContent>
            </Card>

            <Card className="bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900 shadow-none">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                <Clock className="w-5 h-5 text-emerald-500 mb-2" />
                <span className="text-3xl font-black text-emerald-700 dark:text-emerald-400">{stats.avg_resolution_time_hours || 0}</span>
                <span className="text-xs font-semibold text-emerald-600/70 mt-1 uppercase tracking-wider">Avg Hrs to Resolve</span>
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
