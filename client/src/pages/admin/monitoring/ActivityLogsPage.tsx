import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { ModeratorStatsCard } from "@/components/monitoring/ModeratorStatsCard";

export function ActivityLogsPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ category: "all", severity: "all", search: "" });

  const queryParams = new URLSearchParams({
    page: String(page),
    ...(filters.category !== "all" && { category: filters.category }),
    ...(filters.severity !== "all" && { severity: filters.severity }),
    ...(filters.search && { search: filters.search }),
  }).toString();

  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/monitoring/activity-logs", queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/admin/monitoring/activity-logs?${queryParams}`);
      if (!res.ok) throw new Error("Failed to fetch logs");
      return res.json();
    }
  });

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-black tracking-tight uppercase italic italic-primary">
          {t("monitoring.activity_logs", "Activity Logs")}
        </h1>
        <p className="text-muted-foreground font-medium">Real-time audit trail of all platform operations.</p>
      </div>

      <ModeratorStatsCard />

      <div className="flex flex-col xl:flex-row gap-4 p-4 rounded-[1.5rem] border bg-card/50 backdrop-blur-sm">
         <div className="relative flex-1">
           <Input 
             placeholder={t("monitoring.search_action", "Search action or description...")} 
             value={filters.search}
             onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
             className="h-12 px-6 rounded-xl bg-background/50 border-white/10"
           />
         </div>
         <div className="flex flex-wrap gap-2">
           <Select value={filters.category} onValueChange={v => setFilters(f => ({ ...f, category: v }))}>
             <SelectTrigger className="h-12 w-[160px] rounded-xl bg-background/50 border-white/10 font-bold uppercase text-[10px] tracking-widest"><SelectValue placeholder="Category" /></SelectTrigger>
             <SelectContent className="rounded-xl">
               <SelectItem value="all">{t("monitoring.all_categories", "All Categories")}</SelectItem>
               <SelectItem value="auth">Auth</SelectItem>
               <SelectItem value="content">Content</SelectItem>
               <SelectItem value="admin">Admin</SelectItem>
               <SelectItem value="security">Security</SelectItem>
             </SelectContent>
           </Select>
           <Select value={filters.severity} onValueChange={v => setFilters(f => ({ ...f, severity: v }))}>
             <SelectTrigger className="h-12 w-[160px] rounded-xl bg-background/50 border-white/10 font-bold uppercase text-[10px] tracking-widest"><SelectValue placeholder="Severity" /></SelectTrigger>
             <SelectContent className="rounded-xl">
               <SelectItem value="all">{t("monitoring.all_severities", "All Severities")}</SelectItem>
               <SelectItem value="info">Info</SelectItem>
               <SelectItem value="warning">Warning</SelectItem>
               <SelectItem value="error">Error</SelectItem>
               <SelectItem value="critical">{t("monitoring.critical", "Critical")}</SelectItem>
             </SelectContent>
           </Select>
         </div>
      </div>

      <div className="rounded-[2rem] border bg-card/50 backdrop-blur-xl overflow-hidden shadow-2xl shadow-black/5">
        <ResponsiveTable<{ log: any, user: any }>
          keyField="id"
          data={data?.logs || []}
          isLoading={isLoading}
          columns={[
            {
              key: "time",
              label: t("monitoring.time", "Time"),
              render: ({ log }) => (
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest opacity-60">
                  {format(new Date(log.createdAt), 'dd.MM HH:mm:ss')}
                </span>
              )
            },
            {
              key: "severity",
              label: t("monitoring.severity", "Severity"),
              render: ({ log }) => (
                <Badge 
                  variant={log.severity === 'critical' || log.severity === 'error' ? 'destructive' : log.severity === 'warning' ? 'default' : 'secondary'}
                  className="text-[9px] font-black uppercase tracking-widest px-3 h-6"
                >
                  {log.severity}
                </Badge>
              )
            },
            {
              key: "user",
              label: t("monitoring.user", "User"),
              render: ({ log, user }) => (
                <span className="text-sm font-bold">{user?.username || log.userEmail || 'System'}</span>
              )
            },
            {
              key: "action",
              label: t("monitoring.action", "Action"),
              render: ({ log }) => <code className="text-[10px] font-mono bg-muted/50 px-2 py-0.5 rounded text-primary">{log.action}</code>
            },
            {
              key: "description",
              label: t("monitoring.description", "Description"),
              render: ({ log }) => (
                <span className="flex items-center gap-2 text-sm font-medium">
                  {log.isAnomaly === 1 && <AlertTriangle className="w-4 h-4 text-orange-500" />}
                  {log.description}
                </span>
              )
            },
            {
              key: "ip",
              label: t("monitoring.ip", "IP"),
              render: ({ log }) => <span className="text-[10px] font-mono opacity-50">{log.ipAddress}</span>
            }
          ]}
          renderMobileCard={({ log, user }) => (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                 <div className="flex items-center gap-2">
                    <Badge variant={log.severity === 'critical' || log.severity === 'error' ? 'destructive' : 'secondary'} className="text-[8px] h-5">
                       {log.severity.toUpperCase()}
                    </Badge>
                    <span className="text-[10px] font-mono opacity-50">{format(new Date(log.createdAt), 'HH:mm:ss')}</span>
                 </div>
                 <code className="text-[10px] text-primary font-bold uppercase">{log.action}</code>
              </div>
              <div>
                 <p className="text-xs font-bold mb-1">{user?.username || log.userEmail || 'System'}</p>
                 <p className="text-sm font-medium text-foreground/90">{log.description}</p>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-white/5">
                 <span className="text-[9px] font-mono opacity-30">{log.ipAddress}</span>
                 {log.isAnomaly === 1 && <Badge variant="outline" className="text-[8px] border-orange-500/20 text-orange-500 bg-orange-500/5">ANOMALY</Badge>}
              </div>
            </div>
          )}
        />
      </div>
    </div>
  );
}
