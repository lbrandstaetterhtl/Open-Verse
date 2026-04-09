import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { 
  Activity, 
  Search, 
  Filter, 
  Download, 
  Eye, 
  Shield, 
  User, 
  AlertCircle,
  CheckCircle2,
  XCircle,
  Calendar,
  ChevronRight
} from "lucide-react";
import { format } from "date-fns";
import { AdminLayout } from "@/components/admin/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { type ActivityLog } from "@shared/schema";

/* FEATURE [AL-007]: Activity Logs – Frontend implementation. */
export default function ActivityLogsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [status, setStatus] = useState("all");
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);

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

  const handleExport = (format: "csv" | "json") => {
    window.open(`/api/admin/logs/export?format=${format}`, "_blank");
  };

  const severityColors = {
    low: "bg-slate-500/10 text-slate-500 hover:bg-slate-500/20 shadow-none border-none",
    medium: "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 shadow-none border-none",
    high: "bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 shadow-none border-none",
    critical: "bg-red-500/10 text-red-500 hover:bg-red-500/20 shadow-none border-none animate-pulse"
  };

  const statusIcons = {
    success: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
    failure: <XCircle className="h-4 w-4 text-red-500" />,
    warning: <AlertCircle className="h-4 w-4 text-amber-500" />
  };

  return (
    <AdminLayout>
      <div className="space-y-8 animate-in fade-in duration-500 pb-12">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-3xl font-black tracking-tight flex items-center gap-3">
              <Activity className="h-8 w-8 text-primary" />
              Activity Logs
            </h2>
            <p className="text-muted-foreground font-medium">Complete immutable audit trail of all administration actions.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExport("json")} className="font-bold uppercase tracking-widest text-[10px] gap-2">
              <Download className="h-3.5 w-3.5" />
              Export JSON
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport("csv")} className="font-bold uppercase tracking-widest text-[10px] gap-2">
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="bg-card/50 backdrop-blur-sm border-none shadow-sm">
            <CardContent className="p-6">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Total Events</p>
              <p className="text-2xl font-black">{isLoading ? "..." : logs?.length || 0}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 backdrop-blur-sm border-none shadow-sm">
            <CardContent className="p-6 text-orange-500">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-1">High Severity</p>
              <p className="text-2xl font-black">{logs?.filter(l => l.severity === "high" || l.severity === "critical").length || 0}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
          <CardContent className="p-4 flex flex-col md:flex-row gap-4">
            <div className="relative flex-1 group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input 
                placeholder="Search description, target or admin..." 
                className="pl-10 h-10 bg-muted/50 border-none transition-all focus-visible:ring-1 focus-visible:ring-primary"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2 shrink-0">
               <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-[140px] h-10 border-none bg-muted/50">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="users">Users</SelectItem>
                  <SelectItem value="content">Content</SelectItem>
                  <SelectItem value="settings">Settings</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger className="w-[140px] h-10 border-none bg-muted/50">
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severity</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Logs Table */}
        <div className="rounded-xl border bg-card/50 overflow-hidden shadow-sm backdrop-blur-sm">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-transparent border-none">
                <TableHead className="w-[180px] font-black uppercase tracking-widest text-[10px] text-muted-foreground px-6 py-4">Timestamp</TableHead>
                <TableHead className="font-black uppercase tracking-widest text-[10px] text-muted-foreground py-4">Admin</TableHead>
                <TableHead className="font-black uppercase tracking-widest text-[10px] text-muted-foreground py-4">Action</TableHead>
                <TableHead className="font-black uppercase tracking-widest text-[10px] text-muted-foreground py-4">Target</TableHead>
                <TableHead className="font-black uppercase tracking-widest text-[10px] text-muted-foreground py-4 text-center">Severity</TableHead>
                <TableHead className="font-black uppercase tracking-widest text-[10px] text-muted-foreground py-4 text-right pr-6">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i} className="border-muted/50">
                    <TableCell className="px-6 py-4"><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16 mx-auto rounded-full" /></TableCell>
                    <TableCell className="text-right pr-6"><Skeleton className="h-8 w-8 ml-auto rounded" /></TableCell>
                  </TableRow>
                ))
              ) : logs?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground font-medium italic">No activity logs found matching the current filters.</TableCell>
                </TableRow>
              ) : (
                logs?.map((log) => (
                  <TableRow key={log.id} className="group hover:bg-muted/30 transition-colors border-muted/50">
                    <TableCell className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold font-mono tracking-tighter">
                          {format(new Date(log.createdAt), "yyyy-MM-dd")}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(log.createdAt), "HH:mm:ss")}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                         <div className="h-7 w-7 rounded-sm bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
                            <span className="text-[10px] font-black text-primary">{log.adminEmail.charAt(0).toUpperCase()}</span>
                         </div>
                         <div className="flex flex-col">
                            <span className="text-xs font-bold leading-tight">{log.adminEmail}</span>
                            <span className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">{log.adminRole}</span>
                         </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-[10px] font-black bg-muted px-1.5 py-0.5 rounded border text-muted-foreground group-hover:text-foreground transition-colors">
                        {log.action}
                      </code>
                    </TableCell>
                    <TableCell>
                       <div className="flex flex-col">
                          <span className="text-xs font-semibold">{log.targetLabel || "—"}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">{log.targetType} {log.targetId && `ID:${log.targetId}`}</span>
                       </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={cn("text-[10px] font-black uppercase tracking-widest px-2 py-0.5", severityColors[log.severity as keyof typeof severityColors])}>
                        {log.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <Sheet>
                        <SheetTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => setSelectedLog(log)} className="h-8 w-8 group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </SheetTrigger>
                        <SheetContent className="sm:max-w-xl w-full border-l-0 overflow-auto bg-card">
                          <SheetHeader className="mb-8 border-b pb-6">
                            <div className="flex items-center gap-4 mb-4">
                              <div className={cn("p-2 rounded-xl", severityColors[log.severity as keyof typeof severityColors])}>
                                <Shield className="h-6 w-6" />
                              </div>
                              <div className="flex flex-col items-start text-left">
                                <SheetTitle className="text-2xl font-black tracking-tight">{log.action}</SheetTitle>
                                <SheetDescription className="text-sm font-medium">Log Entry Details • ID #{log.id}</SheetDescription>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                               <Badge variant="outline" className="gap-1.5 font-bold uppercase tracking-widest text-[10px]"><Calendar className="h-3 w-3" /> {format(new Date(log.createdAt), "PPpp")}</Badge>
                               <Badge variant="outline" className="gap-1.5 font-bold uppercase tracking-widest text-[10px]"><User className="h-3 w-3" /> {log.adminEmail}</Badge>
                               <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-widest bg-muted/50">
                                 {statusIcons[log.status as keyof typeof statusIcons]}
                                 {log.status}
                               </div>
                            </div>
                          </SheetHeader>

                          <div className="space-y-8">
                            <div>
                              <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                                <div className="h-1 w-1 rounded-full bg-primary" />
                                Description
                              </h4>
                              <p className="text-lg font-bold leading-tight">{log.description}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                               <div>
                                  <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Target Type</h4>
                                  <p className="font-bold">{log.targetType || "N/A"}</p>
                               </div>
                               <div>
                                  <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Target ID</h4>
                                  <p className="font-bold font-mono text-sm">{log.targetId || "—"}</p>
                               </div>
                               <div>
                                  <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">IP Address</h4>
                                  <p className="font-bold font-mono text-xs text-blue-500">{log.ipAddress || "::1"}</p>
                               </div>
                            </div>

                            <div className="space-y-4">
                              <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                <div className="h-1 w-1 rounded-full bg-primary" />
                                Data Changes
                              </h4>
                              
                              <div className="grid gap-4">
                                {log.oldValue && (
                                  <div className="rounded-lg border bg-muted/30 p-4">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Previous State</p>
                                    <pre className="text-[11px] font-mono whitespace-pre-wrap leading-relaxed opacity-70">
                                      {JSON.stringify(JSON.parse(log.oldValue), null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {log.newValue && (
                                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-2">New State</p>
                                    <pre className="text-[11px] font-mono whitespace-pre-wrap leading-relaxed">
                                      {JSON.stringify(JSON.parse(log.newValue), null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {!log.oldValue && !log.newValue && (
                                   <div className="h-20 flex items-center justify-center border border-dashed rounded-lg text-xs text-muted-foreground italic">
                                     No data changes recorded for this action.
                                   </div>
                                )}
                              </div>
                            </div>
                            
                            <div className="space-y-3">
                               <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                <div className="h-1 w-1 rounded-full bg-primary" />
                                Browser / Agent
                              </h4>
                              <p className="text-[10px] font-mono bg-muted p-2 rounded leading-tight text-muted-foreground italic">
                                {log.userAgent || "Unknown User Agent"}
                              </p>
                            </div>
                          </div>
                        </SheetContent>
                      </Sheet>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </AdminLayout>
  );
}
