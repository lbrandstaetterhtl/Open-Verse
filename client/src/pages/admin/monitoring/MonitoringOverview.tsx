import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Loader2, Activity, AlertTriangle, XCircle, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/layout/page-header";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

/* Theme-driven tokens that stay distinct in light and dark mode: danger, warm accent, primary, neutral, faded primary. */
const COLORS = ['hsl(var(--destructive))', 'hsl(var(--star))', 'hsl(var(--primary))', 'hsl(var(--muted-foreground))', 'hsl(var(--primary) / 0.4)'];
const AXIS_TICK = { fontSize: 12, fill: 'hsl(var(--muted-foreground))' };

export function MonitoringOverview() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const { data: metrics, isLoading } = useQuery({
    queryKey: ["/api/admin/monitoring/metrics/overview"],
    refetchInterval: 30000 
  });

  const { data: chartData, isLoading: isLoadingCharts } = useQuery({
    queryKey: ["/api/admin/monitoring/metrics/chart-data"],
    refetchInterval: 60000
  });

  if (!hasPermission("logs")) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="ov-cut h-16 w-16 bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>
        <div className="text-center">
          <h2 className="font-display text-xl font-semibold">{t("monitoring.access_restricted", "Access Restricted")}</h2>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">{t("monitoring.access_restricted_desc", "You do not have the required permissions to access system monitoring logs.")}</p>
        </div>
      </div>
    );
  }

  if (isLoading || isLoadingCharts) return <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("monitoring.eyebrow_monitoring", "Admin / Monitoring")}
        title={t("monitoring.title", "Monitoring Overview")}
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between gap-2 text-sm">
              <span className="ov-label">{t("monitoring.events_today", "Events Today")}</span> <Activity className="w-4 h-4 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="ov-data text-2xl font-semibold">{metrics?.events_today || t("monitoring.not_available", "N/A")}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between gap-2 text-sm">
              <span className="ov-label">{t("monitoring.open_anomalies", "Open Anomalies")}</span> <AlertTriangle className="w-4 h-4 text-star" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="ov-data text-2xl font-semibold">{metrics?.open_anomalies || 0}</div>
            <p className="text-xs text-destructive font-medium">{metrics?.anomalies_critical || 0} {t("monitoring.critical", "Critical")}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between gap-2 text-sm">
              <span className="ov-label">{t("monitoring.error_rate", "Error Rate (1h)")}</span> <XCircle className="w-4 h-4 text-destructive" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="ov-data text-2xl font-semibold">{(metrics?.error_rate_last_hour || 0).toFixed(2)}%</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between gap-2 text-sm">
              <span className="ov-label">{t("monitoring.active_users", "Active Users")}</span> <Users className="w-4 h-4 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="ov-data text-2xl font-semibold">{metrics?.active_users_now || "0"}</div>
            <p className="text-xs text-muted-foreground">{t("monitoring.in_last_5m", "in last 5m")}</p>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg">{t("monitoring.metrics.events_minute_chart", "Events Activity (24h)")}</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 h-64 min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData?.timeData || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorInfo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorWarn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--star))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--star))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground)/0.2)" />
                <XAxis dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                <Area type="monotone" dataKey="info" name={t("monitoring.severity_levels.info", "Info")} stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorInfo)" />
                <Area type="monotone" dataKey="warning" name={t("monitoring.severity_levels.warning", "Warning")} stroke="hsl(var(--star))" fillOpacity={1} fill="url(#colorWarn)" />
                <Area type="monotone" dataKey="error" name={t("monitoring.error_critical", "Error/Critical")} stroke="hsl(var(--destructive))" fillOpacity={0.2} fill="hsl(var(--destructive))" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg">{t("monitoring.metrics.errors_by_category", "Errors & Warnings by Category")}</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 h-64 min-h-[250px] flex items-center justify-center">
            {chartData?.categoryData?.length > 0 && chartData.categoryData[0].name !== 'None' ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData.categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {chartData.categoryData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center text-muted-foreground w-full h-full border border-dashed border-border rounded-sm p-6">
                 <XCircle className="w-8 h-8 opacity-20 mb-2" />
                 <p className="text-sm">{t("monitoring.no_recent_incidents", "No recent incidents")}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
