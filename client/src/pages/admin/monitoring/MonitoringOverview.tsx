import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Loader2, Activity, AlertTriangle, XCircle, Users } from "lucide-react";
import { AdminLayout } from "@/components/admin/admin-layout";
import { useTranslation } from "react-i18next";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

const COLORS = ['#ef4444', '#f97316', '#eab308', '#3b82f6', '#8b5cf6'];

export function MonitoringOverview() {
  const { t } = useTranslation();
  const { data: metrics, isLoading } = useQuery({
    queryKey: ["/api/admin/monitoring/metrics/overview"],
    refetchInterval: 30000 
  });

  const { data: chartData, isLoading: isLoadingCharts } = useQuery({
    queryKey: ["/api/admin/monitoring/metrics/chart-data"],
    refetchInterval: 60000
  });

  if (isLoading || isLoadingCharts) return <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  return (
    <AdminLayout>
      <div className="space-y-6">
      <h1 className="text-3xl font-bold">{t("monitoring.title", "Monitoring Overview")}</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex justify-between">
              {t("monitoring.events_today", "Events Today")} <Activity className="w-4 h-4 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.events_today || "N/A"}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex justify-between">
              {t("monitoring.open_anomalies", "Open Anomalies")} <AlertTriangle className="w-4 h-4 text-orange-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.open_anomalies || 0}</div>
            <p className="text-xs text-red-500 font-medium">{metrics?.anomalies_critical || 0} {t("monitoring.critical", "Critical")}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex justify-between">
              {t("monitoring.error_rate", "Error Rate (1h)")} <XCircle className="w-4 h-4 text-red-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(metrics?.error_rate_last_hour || 0).toFixed(2)}%</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex justify-between">
              {t("monitoring.active_users", "Active Users")} <Users className="w-4 h-4 text-blue-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.active_users_now || "0"}</div>
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
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorWarn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground)/0.2)" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                <Area type="monotone" dataKey="info" name="Info" stroke="#3b82f6" fillOpacity={1} fill="url(#colorInfo)" />
                <Area type="monotone" dataKey="warning" name="Warning" stroke="#f97316" fillOpacity={1} fill="url(#colorWarn)" />
                <Area type="monotone" dataKey="error" name="Error/Critical" stroke="#ef4444" fillOpacity={0.2} fill="#ef4444" />
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
              <div className="flex flex-col items-center justify-center text-muted-foreground w-full h-full border border-dashed rounded-lg p-6">
                 <XCircle className="w-8 h-8 opacity-20 mb-2" />
                 <p className="text-sm">No recent incidents</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </div>
    </AdminLayout>
  );
}
