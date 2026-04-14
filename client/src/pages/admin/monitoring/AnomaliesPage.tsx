import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{t("monitoring.anomalies", "Anomaly Detection")}</h1>

      <div className="flex gap-4 mb-4 bg-card p-4 rounded-lg border">
         <Select value={statusFilter} onValueChange={setStatusFilter}>
           <SelectTrigger className="w-[180px]"><SelectValue placeholder={t("monitoring.status", "Status")} /></SelectTrigger>
           <SelectContent>
             <SelectItem value="open">{t("monitoring.open", "Open")}</SelectItem>
             <SelectItem value="investigating">{t("monitoring.investigating", "Investigating")}</SelectItem>
             <SelectItem value="resolved">{t("monitoring.resolved", "Resolved")}</SelectItem>
             <SelectItem value="false_positive">{t("monitoring.false_positive", "False Positive")}</SelectItem>
           </SelectContent>
         </Select>
      </div>

      <div className="border rounded-lg bg-card">
        <Table>
          <TableHeader>
             <TableRow>
               <TableHead>{t("monitoring.time", "Time")}</TableHead>
               <TableHead>{t("monitoring.severity", "Severity")}</TableHead>
               <TableHead>{t("monitoring.type", "Type")}</TableHead>
               <TableHead>{t("monitoring.user", "User")}</TableHead>
               <TableHead>{t("monitoring.description", "Description")}</TableHead>
               <TableHead>{t("monitoring.auto_action", "Auto Action")}</TableHead>
               <TableHead>{t("monitoring.status", "Status")}</TableHead>
             </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
               <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
            ) : data?.anomalies?.length === 0 ? (
               <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{t("monitoring.no_anomalies", "No anomalies found")}</TableCell></TableRow>
            ) : data?.anomalies?.map(({ anomaly, user }: any) => (
               <TableRow key={anomaly.id}>
                 <TableCell className="whitespace-nowrap text-xs">
                     {format(new Date(anomaly.createdAt), 'dd.MM HH:mm:ss')}
                 </TableCell>
                 <TableCell>
                     <Badge variant={anomaly.severity === 'critical' || anomaly.severity === 'high' ? 'destructive' : anomaly.severity === 'warning' ? 'default' : 'secondary'}>
                         {anomaly.severity}
                     </Badge>
                 </TableCell>
                 <TableCell className="font-mono text-xs">{anomaly.anomalyType}</TableCell>
                 <TableCell>{user?.username || 'Unknown'}</TableCell>
                 <TableCell>
                     <div className="flex flex-col">
                        <span className="font-semibold text-sm">{anomaly.title}</span>
                        <span className="text-xs text-muted-foreground">{anomaly.description}</span>
                     </div>
                 </TableCell>
                 <TableCell><Badge variant="outline">{anomaly.autoAction}</Badge></TableCell>
                 <TableCell><Badge variant="secondary">{anomaly.status}</Badge></TableCell>
               </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      </div>
  );
}
