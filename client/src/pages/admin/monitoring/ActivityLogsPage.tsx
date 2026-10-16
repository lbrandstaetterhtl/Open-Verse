import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { ModeratorStatsCard } from "@/components/monitoring/ModeratorStatsCard";
import { cn } from "@/lib/utils";

/* Severity chip tint: errors read as danger, warnings in the warm accent, everything else neutral. */
const severityChip = (severity: string) =>
  severity === "critical" || severity === "error"
    ? "ov-chip-danger"
    : severity === "warning"
      ? "ov-chip-star"
      : "";

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
      <PageHeader
        eyebrow={t("monitoring.eyebrow_monitoring", "Admin / Monitoring")}
        title={t("monitoring.activity_logs", "Activity Logs")}
        description={t("monitoring.activity_logs_desc", "Real-time audit trail of all platform operations.")}
      />

      <ModeratorStatsCard />

      <div className="ov-panel flex flex-col xl:flex-row gap-4 p-4">
         <div className="relative flex-1">
           <Input
             placeholder={t("monitoring.search_action", "Search action or description...")}
             value={filters.search}
             onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
             className="h-11"
           />
         </div>
         <div className="flex flex-wrap gap-2">
           <Select value={filters.category} onValueChange={v => setFilters(f => ({ ...f, category: v }))}>
             <SelectTrigger className="h-11 w-[160px]"><SelectValue placeholder={t("monitoring.category", "Category")} /></SelectTrigger>
             <SelectContent>
               <SelectItem value="all">{t("monitoring.all_categories", "All Categories")}</SelectItem>
               <SelectItem value="auth">{t("monitoring.categories.auth", "Auth")}</SelectItem>
               <SelectItem value="content">{t("monitoring.categories.content", "Content")}</SelectItem>
               <SelectItem value="admin">{t("monitoring.categories.admin", "Admin")}</SelectItem>
               <SelectItem value="security">{t("monitoring.categories.security", "Security")}</SelectItem>
             </SelectContent>
           </Select>
           <Select value={filters.severity} onValueChange={v => setFilters(f => ({ ...f, severity: v }))}>
             <SelectTrigger className="h-11 w-[160px]"><SelectValue placeholder={t("monitoring.severity", "Severity")} /></SelectTrigger>
             <SelectContent>
               <SelectItem value="all">{t("monitoring.all_severities", "All Severities")}</SelectItem>
               <SelectItem value="info">{t("monitoring.severity_levels.info", "Info")}</SelectItem>
               <SelectItem value="warning">{t("monitoring.severity_levels.warning", "Warning")}</SelectItem>
               <SelectItem value="error">{t("monitoring.severity_levels.error", "Error")}</SelectItem>
               <SelectItem value="critical">{t("monitoring.critical", "Critical")}</SelectItem>
             </SelectContent>
           </Select>
         </div>
      </div>

      <div>
        <ResponsiveTable<{ log: any, user: any }>
          keyField={(row) => row.log.id}
          data={data?.logs || []}
          isLoading={isLoading}
          columns={[
            {
              key: "time",
              label: t("monitoring.time", "Time"),
              render: ({ log }) => (
                <span className="ov-data text-xs text-muted-foreground">
                  {format(new Date(log.createdAt), 'dd.MM HH:mm:ss')}
                </span>
              )
            },
            {
              key: "severity",
              label: t("monitoring.severity", "Severity"),
              render: ({ log }) => (
                <span className={cn("ov-chip capitalize", severityChip(log.severity))}>
                  {t(`monitoring.severity_levels.${log.severity}`, String(log.severity))}
                </span>
              )
            },
            {
              key: "user",
              label: t("monitoring.user", "User"),
              render: ({ log, user }) => (
                <span className="text-sm font-semibold">{user?.username || log.userEmail || t("monitoring.system", "System")}</span>
              )
            },
            {
              key: "action",
              label: t("monitoring.action", "Action"),
              render: ({ log }) => <code className="font-data text-xs bg-muted/50 px-2 py-0.5 rounded-sm text-primary">{log.action}</code>
            },
            {
              key: "description",
              label: t("monitoring.description", "Description"),
              render: ({ log }) => (
                <span className="flex items-center gap-2 text-sm font-medium">
                  {log.isAnomaly === 1 && <AlertTriangle className="w-4 h-4 text-star" />}
                  {log.description}
                </span>
              )
            },
            {
              key: "ip",
              label: t("monitoring.ip", "IP"),
              render: ({ log }) => <span className="ov-data text-xs text-muted-foreground">{log.ipAddress}</span>
            }
          ]}
          renderMobileCard={({ log, user }) => (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                 <div className="flex items-center gap-2">
                    <span className={cn("ov-chip capitalize h-5", severityChip(log.severity))}>
                       {t(`monitoring.severity_levels.${log.severity}`, String(log.severity))}
                    </span>
                    <span className="ov-data text-xs text-muted-foreground">{format(new Date(log.createdAt), 'HH:mm:ss')}</span>
                 </div>
                 <code className="font-data text-xs font-semibold text-primary">{log.action}</code>
              </div>
              <div>
                 <p className="text-xs font-semibold mb-1">{user?.username || log.userEmail || t("monitoring.system", "System")}</p>
                 <p className="text-sm font-medium text-foreground/90">{log.description}</p>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-border">
                 <span className="ov-data text-xs text-muted-foreground">{log.ipAddress}</span>
                 {log.isAnomaly === 1 && <span className="ov-chip ov-chip-star h-5">{t("monitoring.anomaly_badge", "ANOMALY")}</span>}
              </div>
            </div>
          )}
        />
      </div>
    </div>
  );
}
