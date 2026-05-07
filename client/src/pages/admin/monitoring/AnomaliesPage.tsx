import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";

export function AnomaliesPage() {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState("open");

  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/monitoring/anomalies", statusFilter],
    queryFn: async () => {
      const res = await fetch(`/api/admin/monitoring/anomalies?status=${statusFilter}`);
      if (!res.ok) throw new Error("Failed to fetch anomalies");
      return res.json();
    }
  });

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-black tracking-tight uppercase italic italic-primary">
          {t("monitoring.anomalies", "Anomaly Detection")}
        </h1>
        <p className="text-muted-foreground font-medium">AI-driven identification of irregular platform patterns.</p>
      </div>

      <div className="p-4 rounded-[1.5rem] border bg-card/50 backdrop-blur-sm max-w-sm">
         <Select value={statusFilter} onValueChange={setStatusFilter}>
           <SelectTrigger className="h-12 rounded-xl bg-background/50 border-white/10 font-bold uppercase text-[10px] tracking-widest">
             <SelectValue placeholder={t("monitoring.status", "Status")} />
           </SelectTrigger>
           <SelectContent className="rounded-xl">
             <SelectItem value="open">{t("monitoring.open", "Open")}</SelectItem>
             <SelectItem value="investigating">{t("monitoring.investigating", "Investigating")}</SelectItem>
             <SelectItem value="resolved">{t("monitoring.resolved", "Resolved")}</SelectItem>
             <SelectItem value="false_positive">{t("monitoring.false_positive", "False Positive")}</SelectItem>
           </SelectContent>
         </Select>
      </div>

      <div className="rounded-[2rem] border bg-card/50 backdrop-blur-xl overflow-hidden shadow-2xl shadow-black/5">
        <ResponsiveTable<{ anomaly: any, user: any }>
          keyField="id"
          data={data?.anomalies || []}
          isLoading={isLoading}
          columns={[
            {
              key: "time",
              label: t("monitoring.time", "Time"),
              render: ({ anomaly }) => (
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest opacity-60">
                  {format(new Date(anomaly.createdAt), 'dd.MM HH:mm:ss')}
                </span>
              )
            },
            {
              key: "severity",
              label: t("monitoring.severity", "Severity"),
              render: ({ anomaly }) => (
                <Badge 
                  variant={anomaly.severity === 'critical' || anomaly.severity === 'high' ? 'destructive' : anomaly.severity === 'warning' ? 'default' : 'secondary'}
                  className="text-[9px] font-black uppercase tracking-widest px-3 h-6"
                >
                  {anomaly.severity}
                </Badge>
              )
            },
            {
              key: "type",
              label: t("monitoring.type", "Type"),
              render: ({ anomaly }) => <code className="text-[10px] font-mono bg-primary/5 text-primary px-2 py-0.5 rounded border border-primary/10">{anomaly.anomalyType}</code>
            },
            {
              key: "user",
              label: t("monitoring.user", "User"),
              render: ({ user }) => <span className="text-sm font-bold">{user?.username || 'Unknown'}</span>
            },
            {
              key: "description",
              label: t("monitoring.description", "Description"),
              render: ({ anomaly }) => (
                <div className="flex flex-col py-1">
                  <span className="font-bold text-sm leading-tight">{anomaly.title}</span>
                  <span className="text-[11px] text-muted-foreground line-clamp-1">{anomaly.description}</span>
                </div>
              )
            },
            {
              key: "action",
              label: t("monitoring.auto_action", "Auto Action"),
              render: ({ anomaly }) => <Badge variant="outline" className="text-[9px] font-black uppercase tracking-tighter border-white/10">{anomaly.autoAction}</Badge>
            },
            {
              key: "status",
              label: t("monitoring.status", "Status"),
              render: ({ anomaly }) => <Badge variant="secondary" className="text-[9px] font-bold uppercase tracking-widest">{anomaly.status}</Badge>
            }
          ]}
          renderMobileCard={({ anomaly, user }) => (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                 <Badge variant={anomaly.severity === 'critical' || anomaly.severity === 'high' ? 'destructive' : 'secondary'} className="text-[8px] h-5">
                    {anomaly.severity.toUpperCase()}
                 </Badge>
                 <span className="text-[10px] font-mono opacity-50">{format(new Date(anomaly.createdAt), 'dd.MM HH:mm:ss')}</span>
              </div>
              <div>
                 <p className="text-sm font-black mb-1 italic italic-primary uppercase tracking-tighter">{anomaly.title}</p>
                 <p className="text-xs text-muted-foreground leading-relaxed">{anomaly.description}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/5">
                 <div className="space-y-1">
                    <p className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">Entity</p>
                    <p className="text-[10px] font-bold">{user?.username || 'Unknown'}</p>
                 </div>
                 <div className="space-y-1">
                    <p className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">Type</p>
                    <p className="text-[10px] font-mono font-bold text-primary">{anomaly.anomalyType}</p>
                 </div>
              </div>
              <div className="flex justify-between items-center bg-muted/20 -mx-4 -mb-4 p-4 mt-2">
                 <Badge variant="outline" className="text-[8px] font-black border-white/10 uppercase">{anomaly.autoAction}</Badge>
                 <Badge className="text-[8px] font-black uppercase bg-primary/20 text-primary border-none">{anomaly.status}</Badge>
              </div>
            </div>
          )}
        />
      </div>
    </div>
  );
}
