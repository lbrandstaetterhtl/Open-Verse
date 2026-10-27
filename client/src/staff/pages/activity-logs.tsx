import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Search,
  Download,
  Shield,
  User,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Calendar,
  ChevronRight
} from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { PageHeader } from "@/components/layout/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ActivityLog } from "@shared/schema";

import { useDateLocale } from "@/lib/date-locale";
/* FEATURE [AL-007]: Activity Logs – Frontend implementation. */
export default function ActivityLogsPage() {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  // Target types are code values ("User", "Post", ...) stored with each log entry
  const targetTypeLabel = (type: string) => t(`staff:admin_logs.target_types.${type}`, type);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [status] = useState("all");


  const { data: logs, isLoading } = useQuery<ActivityLog[]>({
    queryKey: ["/api/admin/logs", { search, category, severity, status }],
    queryFn: async ({ queryKey }) => {
      const [_path, params] = queryKey as [string, any];
      const searchParams = new URLSearchParams();
      if (params.search) searchParams.set("search", params.search);
      if (params.category !== "all") searchParams.set("category", params.category);
      if (params.severity !== "all") searchParams.set("severity", params.severity);
      if (params.status !== "all") searchParams.set("status", params.status);

      const res = await fetch(`/api/admin/logs?${searchParams.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch logs");
      return res.json();
    }
  });

  const handleExport = (exportFormat: "csv" | "json") => {
    window.open(`/api/admin/logs/export?format=${exportFormat}`, "_blank", "noopener,noreferrer");
  };

  /* Severity chips (tables, cards) and the matching tint for the icon tile in the detail sheet. */
  const severityColors = {
    low: "",
    medium: "ov-chip-primary",
    high: "ov-chip-star",
    critical: "ov-chip-danger"
  };

  const severityIconColors = {
    low: "bg-muted text-muted-foreground",
    medium: "bg-primary/10 text-primary",
    high: "bg-star/10 text-star",
    critical: "bg-destructive/10 text-destructive"
  };

  const statusIcons = {
    success: <CheckCircle2 className="h-4 w-4" />,
    failure: <XCircle className="h-4 w-4" />,
    warning: <AlertCircle className="h-4 w-4" />
  };

  const statusColors = {
    success: "ov-chip-success",
    failure: "ov-chip-danger",
    warning: "ov-chip-star"
  };

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-500 pb-12">
        <PageHeader
          eyebrow={t("staff:monitoring.eyebrow_audit", "Admin / Audit")}
          title={t("staff:admin_logs.title", "Activity Logs")}
          description={t("staff:admin_logs.description", "Immutable audit trail of all administrative operations.")}
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => handleExport("json")}>
                <Download className="h-4 w-4" />
                {t("staff:admin_logs.export_json", "Export JSON")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExport("csv")}>
                <Download className="h-4 w-4" />
                {t("staff:admin_logs.export_csv", "Export CSV")}
              </Button>
            </>
          }
        />

        {/* Stats Summary */}
        <div className="grid gap-6 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-5">
              <p className="ov-label mb-2">{t("staff:admin_logs.total_events", "Total events")}</p>
              <p className="ov-data text-3xl font-semibold">{isLoading ? "..." : logs?.length || 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="ov-label mb-2 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden="true" />
                {t("staff:admin_logs.high_severity", "High severity")}
              </p>
              <p className="ov-data text-3xl font-semibold text-destructive">{logs?.filter(l => l.severity === "high" || l.severity === "critical").length || 0}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4 flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1 group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input
                placeholder={t("staff:admin_logs.search_placeholder", "Search description, target or admin…")}
                className="h-11 pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-3 overflow-x-auto no-scrollbar">
               <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-11 w-[180px]">
                  <SelectValue placeholder={t("staff:admin_logs.category", "Category")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("staff:monitoring.all_categories", "All Categories")}</SelectItem>
                  <SelectItem value="users">{t("staff:admin_logs.categories.users", "Users")}</SelectItem>
                  <SelectItem value="content">{t("staff:admin_logs.categories.content", "Content")}</SelectItem>
                  <SelectItem value="settings">{t("staff:admin_logs.categories.settings", "Settings")}</SelectItem>
                  <SelectItem value="system">{t("staff:admin_logs.categories.system", "System")}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger className="h-11 w-[180px]">
                  <SelectValue placeholder={t("staff:admin_logs.severity", "Severity")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("staff:monitoring.all_severities", "All Severities")}</SelectItem>
                  <SelectItem value="low">{t("staff:admin_logs.severity_levels.low", "Low")}</SelectItem>
                  <SelectItem value="medium">{t("staff:admin_logs.severity_levels.medium", "Medium")}</SelectItem>
                  <SelectItem value="high">{t("staff:admin_logs.severity_levels.high", "High")}</SelectItem>
                  <SelectItem value="critical">{t("staff:admin_logs.severity_levels.critical", "Critical")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Logs Table */}
        <div>
          <ResponsiveTable<ActivityLog>
            keyField="id"
            data={logs || []}
            isLoading={isLoading}
            columns={[
              {
                key: "timestamp",
                label: t("staff:admin_logs.col_timestamp", "Timestamp"),
                render: (log) => (
                  <div className="flex flex-col py-1">
                    <span className="ov-data text-xs text-muted-foreground">
                      {format(new Date(log.createdAt), "yyyy-MM-dd")}
                    </span>
                    <span className="ov-data text-sm font-semibold">
                      {format(new Date(log.createdAt), "HH:mm:ss")}
                    </span>
                  </div>
                )
              },
              {
                key: "admin",
                label: t("staff:admin_logs.col_administrator", "Administrator"),
                render: (log) => (
                  <div className="flex items-center gap-3">
                     <div className="ov-avatar h-10 w-10 shrink-0 bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-semibold text-primary">{(log.userUsername || "S").charAt(0).toUpperCase()}</span>
                     </div>
                     <div className="flex flex-col">
                        <span className="text-sm font-semibold leading-tight">{log.userUsername || t("staff:admin_logs.system", "System")}</span>
                        <span className="ov-chip ov-chip-primary capitalize mt-1 h-5 w-fit px-1.5">
                           {log.userRole ? t(`admin.roles.${log.userRole}`, log.userRole) : t("admin.roles.admin", "Admin")}
                        </span>
                     </div>
                  </div>
                )
              },
              {
                key: "action",
                label: t("staff:admin_logs.col_action", "Action"),
                render: (log) => (
                  <span className="text-sm font-medium" title={log.action}>
                    {t(`staff:admin_logs.actions.${log.action}`, String(log.action))}
                  </span>
                )
              },
              {
                key: "severity",
                label: t("staff:admin_logs.severity", "Severity"),
                render: (log) => (
                  <span className={cn("ov-chip capitalize", severityColors[log.severity as keyof typeof severityColors])}>
                    {t(`staff:admin_logs.severity_levels.${log.severity}`, log.severity)}
                  </span>
                )
              },
              {
                key: "details",
                label: t("staff:admin_logs.col_analysis", "Analysis"),
                render: (log) => (
                  <div className="flex justify-end">
                    <Sheet>
                      <SheetTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <ChevronRight className="h-5 w-5" />
                        </Button>
                      </SheetTrigger>
                      <SheetContent className="sm:max-w-xl w-full bg-card">
                        <SheetHeader className="ov-rule mb-8 pb-6">
                          <div className="flex items-center gap-4 mb-5">
                            <div className={cn("ov-cut p-3", severityIconColors[log.severity as keyof typeof severityIconColors])}>
                              <Shield className="h-6 w-6" />
                            </div>
                            <div className="flex flex-col items-start text-left space-y-1">
                              <SheetTitle className="font-display text-2xl font-semibold" title={log.action}>{t(`staff:admin_logs.actions.${log.action}`, String(log.action))}</SheetTitle>
                              <SheetDescription><span className="ov-label">{t("staff:admin_logs.audit_entry", { id: log.id, defaultValue: "Audit Entry • Event #{{id}}" })}</span></SheetDescription>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                             <span className="ov-chip"><Calendar className="h-3.5 w-3.5" /> <span className="ov-data">{format(new Date(log.createdAt), "PPpp", { locale: dateLocale })}</span></span>
                             <span className="ov-chip"><User className="h-3.5 w-3.5" /> {log.userUsername || t("staff:admin_logs.system", "System")}</span>
                             <span className={cn("ov-chip capitalize", statusColors[log.status as keyof typeof statusColors])}>
                               {statusIcons[log.status as keyof typeof statusIcons]}
                               {t(`staff:admin_logs.status.${log.status}`, log.status)}
                             </span>
                          </div>
                        </SheetHeader>

                        <div className="space-y-8">
                          <div className="ov-panel p-5">
                            <h4 className="ov-label mb-3">{t("staff:admin_logs.detail_description", "Description")}</h4>
                            <p className="text-lg font-medium leading-snug">{log.description}</p>
                          </div>

                          <div className="grid grid-cols-2 gap-8 px-2">
                             <div>
                                <h4 className="ov-label mb-2">{t("staff:admin_logs.target_type", "Target type")}</h4>
                                <p className="text-sm font-semibold text-primary">{log.targetType ? targetTypeLabel(log.targetType) : t("staff:admin_logs.not_available", "N/A")}</p>
                             </div>
                             <div>
                                <h4 className="ov-label mb-2">{t("staff:admin_logs.target_identifier", "Target identifier")}</h4>
                                <p className="ov-data text-sm text-muted-foreground">{log.targetId ? `#${log.targetId}` : "—"}</p>
                             </div>
                             <div className="col-span-2">
                                <h4 className="ov-label mb-2">{t("staff:admin_logs.origin_ip", "Origin IP")}</h4>
                                <p className="ov-data text-sm">{log.ipAddress || "::1"}</p>
                             </div>
                          </div>

                          <div className="space-y-4">
                            <h4 className="ov-label px-2">{t("staff:admin_logs.payload_delta", "Payload delta")}</h4>
                            <div className="grid gap-6">
                              {log.oldValue && (
                                <div className="ov-panel p-5">
                                  <p className="ov-label mb-3">{t("staff:admin_logs.previous_state", "Previous state")}</p>
                                  <pre className="ov-data text-[11px] whitespace-pre-wrap leading-relaxed text-muted-foreground max-h-40 overflow-y-auto thin-scrollbar">
                                    {prettyJson(log.oldValue)}
                                  </pre>
                                </div>
                              )}
                              {log.newValue && (
                                <div className="ov-panel ov-panel-active p-5">
                                  <p className="ov-label mb-3 text-primary">{t("staff:admin_logs.new_state", "New state")}</p>
                                  <pre className="ov-data text-[11px] whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto thin-scrollbar">
                                    {prettyJson(log.newValue)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </SheetContent>
                    </Sheet>
                  </div>
                )
              }
            ]}
            renderMobileCard={(log) => (
               <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                     <div className="flex items-center gap-2">
                        <span className={cn("ov-chip capitalize h-5", severityColors[log.severity as keyof typeof severityColors])}>
                           {t(`staff:admin_logs.severity_levels.${log.severity}`, log.severity)}
                        </span>
                        <span className="ov-data text-xs text-muted-foreground">{format(new Date(log.createdAt), "HH:mm:ss")}</span>
                     </div>
                     <code className="font-data text-xs text-primary">{log.action}</code>
                  </div>
                  <div>
                     <p className="text-xs font-semibold mb-1">{log.userUsername || t("staff:admin_logs.system", "System")}</p>
                     <p className="text-sm leading-relaxed text-foreground/80">"{log.description}"</p>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-border">
                     <span className="ov-label">{targetTypeLabel(log.targetType ?? "")}</span>
                     <Sheet>
                        <SheetTrigger asChild>
                          <Button variant="outline" size="sm" className="h-8">{t("staff:admin_logs.details", "Details")}</Button>
                        </SheetTrigger>
                        {/* Mobile Sheet Content (Same as Desktop for consistency) */}
                        <SheetContent side="bottom" className="h-[90vh] rounded-t-xl bg-card overflow-y-auto px-6">
                           <div className="w-12 h-1.5 bg-muted rounded-pill mx-auto mb-8" />
                           {/* Simplified details for mobile */}
                           <div className="space-y-6 pb-12">
                              <div className="flex items-center gap-4">
                                 <div className={cn("ov-cut p-3", severityIconColors[log.severity as keyof typeof severityIconColors])}>
                                    <Shield className="h-6 w-6" />
                                 </div>
                                 <h2 className="font-display text-xl font-semibold leading-tight" title={log.action}>{t(`staff:admin_logs.actions.${log.action}`, String(log.action))}</h2>
                              </div>
                              <div className="space-y-1">
                                 <p className="ov-label">{t("staff:admin_logs.admin", "Admin")}</p>
                                 <p className="font-semibold">{log.userUsername || t("staff:admin_logs.system", "System")}</p>
                              </div>
                              <div className="space-y-2">
                                 <p className="ov-label">{t("staff:admin_logs.log_entry", "Log entry")}</p>
                                 <p className="text-md font-medium">"{log.description}"</p>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                 <div className="ov-panel p-4">
                                    <p className="ov-label mb-1">{t("staff:admin_logs.target", "Target")}</p>
                                    <p className="text-xs font-semibold truncate">{log.targetLabel || (log.targetType ? targetTypeLabel(log.targetType) : "—")}</p>
                                 </div>
                                 <div className="ov-panel p-4">
                                    <p className="ov-label mb-1">{t("staff:admin_logs.ip_address", "IP address")}</p>
                                    <p className="ov-data text-xs truncate">{log.ipAddress || "::1"}</p>
                                 </div>
                              </div>
                              {log.newValue && (
                                 <div className="space-y-3">
                                    <p className="ov-label text-primary">{t("staff:admin_logs.new_state_delta", "New state delta")}</p>
                                    <pre className="ov-data text-[10px] bg-primary/10 p-4 rounded-sm overflow-x-auto">
                                       {prettyJson(log.newValue)}
                                    </pre>
                                 </div>
                              )}
                           </div>
                        </SheetContent>
                     </Sheet>
                  </div>
               </div>
            )}
          />
        </div>
    </div>
  );
}

/** Stored values are JSON text; anything else (old or broken rows) is shown as it is instead of crashing. */
function prettyJson(value: unknown): string {
  if (typeof value !== "string") return JSON.stringify(value, null, 2);
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}
