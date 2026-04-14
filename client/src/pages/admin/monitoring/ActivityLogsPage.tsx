import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, AlertTriangle } from "lucide-react";
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
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{t("monitoring.activity_logs", "Activity Logs")}</h1>

      <ModeratorStatsCard />

      <div className="flex gap-4 mb-4 bg-card p-4 rounded-lg border">
         <Input 
           placeholder={t("monitoring.search_action", "Search action or description...")} 
           value={filters.search}
           onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
           className="max-w-sm"
         />
         <Select value={filters.category} onValueChange={v => setFilters(f => ({ ...f, category: v }))}>
           <SelectTrigger className="w-[180px]"><SelectValue placeholder="Category" /></SelectTrigger>
           <SelectContent>
             <SelectItem value="all">{t("monitoring.all_categories", "All Categories")}</SelectItem>
             <SelectItem value="auth">Auth</SelectItem>
             <SelectItem value="content">Content</SelectItem>
             <SelectItem value="admin">Admin</SelectItem>
             <SelectItem value="security">Security</SelectItem>
           </SelectContent>
         </Select>
         <Select value={filters.severity} onValueChange={v => setFilters(f => ({ ...f, severity: v }))}>
           <SelectTrigger className="w-[180px]"><SelectValue placeholder="Severity" /></SelectTrigger>
           <SelectContent>
             <SelectItem value="all">{t("monitoring.all_severities", "All Severities")}</SelectItem>
             <SelectItem value="info">Info</SelectItem>
             <SelectItem value="warning">Warning</SelectItem>
             <SelectItem value="error">Error</SelectItem>
             <SelectItem value="critical">{t("monitoring.critical", "Critical")}</SelectItem>
           </SelectContent>
         </Select>
      </div>

      <div className="border rounded-lg bg-card">
        <Table>
          <TableHeader>
             <TableRow>
               <TableHead>{t("monitoring.time", "Time")}</TableHead>
               <TableHead>{t("monitoring.severity", "Severity")}</TableHead>
               <TableHead>{t("monitoring.user", "User")}</TableHead>
               <TableHead>{t("monitoring.action", "Action")}</TableHead>
               <TableHead>{t("monitoring.description", "Description")}</TableHead>
               <TableHead>{t("monitoring.ip", "IP")}</TableHead>
             </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
               <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
            ) : data?.logs?.length === 0 ? (
               <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t("monitoring.no_logs", "No logs found")}</TableCell></TableRow>
            ) : data?.logs?.map(({ log, user }: any) => (
               <TableRow key={log.id} className={
                   log.severity === 'critical' ? 'bg-red-500/10' : 
                   log.severity === 'error' ? 'bg-orange-500/10' : 
                   log.severity === 'warning' ? 'bg-yellow-500/10' : ''
               }>
                 <TableCell className="whitespace-nowrap text-xs">
                     {format(new Date(log.createdAt), 'dd.MM HH:mm:ss')}
                 </TableCell>
                 <TableCell>
                     <Badge variant={log.severity === 'critical' || log.severity === 'error' ? 'destructive' : log.severity === 'warning' ? 'default' : 'secondary'}>
                         {log.severity}
                     </Badge>
                 </TableCell>
                 <TableCell>{user?.username || log.userEmail || 'System'}</TableCell>
                 <TableCell className="font-mono text-xs">{log.action}</TableCell>
                 <TableCell>
                     <span className="flex items-center gap-2">
                       {log.isAnomaly === 1 && <AlertTriangle className="w-4 h-4 text-orange-500" />}
                       {log.description}
                     </span>
                 </TableCell>
                 <TableCell className="text-xs text-muted-foreground">{log.ipAddress}</TableCell>
               </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      </div>
  );
}
