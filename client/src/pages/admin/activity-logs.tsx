import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { 
  Activity, 
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
import { Badge } from "@/components/ui/badge";
import { ResponsiveTable } from "@/components/ui/responsive-table";
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
  const { _t } = useTranslation();
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
    window.open(`/api/admin/logs/export?format=${exportFormat}`, "_blank");
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
    <div className="w-full space-y-8 animate-in fade-in duration-500 pb-12">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-4xl font-black tracking-tight uppercase italic italic-primary flex items-center gap-3">
              <Activity className="h-10 w-10 text-primary" />
              Activity Logs
            </h2>
            <p className="text-muted-foreground font-medium">Immutable audit trail of all administrative operations.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => handleExport("json")} className="h-12 px-6 rounded-xl font-bold uppercase tracking-widest text-[10px] gap-2 border-2">
              <Download className="h-4 w-4" />
              Export JSON
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport("csv")} className="h-12 px-6 rounded-xl font-bold uppercase tracking-widest text-[10px] gap-2 border-2">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid gap-6 grid-cols-2 lg:grid-cols-4">
          <Card className="bg-card/30 backdrop-blur-xl border-white/5 shadow-2xl shadow-black/5 rounded-[2rem]">
            <CardContent className="p-8">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-2">Total Events</p>
              <p className="text-4xl font-black tracking-tighter">{isLoading ? "..." : logs?.length || 0}</p>
            </CardContent>
          </Card>
          <Card className="bg-red-500/5 backdrop-blur-xl border-red-500/10 shadow-2xl shadow-red-500/5 rounded-[2rem]">
            <CardContent className="p-8">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500/70 mb-2">High Severity</p>
              <p className="text-4xl font-black tracking-tighter text-red-500">{logs?.filter(l => l.severity === "high" || l.severity === "critical").length || 0}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="border-white/5 shadow-2xl shadow-black/5 bg-card/30 backdrop-blur-xl rounded-[2.5rem] overflow-hidden">
          <CardContent className="p-4 flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-all" />
              <Input 
                placeholder="Search description, target or admin..." 
                className="pl-12 h-14 bg-background/50 border-transparent rounded-[1.5rem] focus-visible:ring-primary focus-visible:bg-background transition-all shadow-inner"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-3 overflow-x-auto no-scrollbar">
               <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-[180px] h-14 rounded-[1.5rem] bg-background/50 border-transparent font-black uppercase text-[10px] tracking-widest px-6 shadow-inner">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl">
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="users">Users</SelectItem>
                  <SelectItem value="content">Content</SelectItem>
                  <SelectItem value="settings">Settings</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger className="w-[180px] h-14 rounded-[1.5rem] bg-background/50 border-transparent font-black uppercase text-[10px] tracking-widest px-6 shadow-inner">
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl">
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
        <div className="rounded-[2.5rem] border border-white/5 bg-card/30 backdrop-blur-xl overflow-hidden shadow-2xl shadow-black/5">
          <ResponsiveTable<ActivityLog>
            keyField="id"
            data={logs || []}
            isLoading={isLoading}
            columns={[
              {
                key: "timestamp",
                label: "Timestamp",
                render: (log) => (
                  <div className="flex flex-col py-2">
                    <span className="text-[10px] font-black font-mono tracking-widest uppercase opacity-60">
                      {format(new Date(log.createdAt), "yyyy-MM-dd")}
                    </span>
                    <span className="text-sm font-bold tabular-nums">
                      {format(new Date(log.createdAt), "HH:mm:ss")}
                    </span>
                  </div>
                )
              },
              {
                key: "admin",
                label: "Administrator",
                render: (log) => (
                  <div className="flex items-center gap-3">
                     <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-xl shadow-primary/5">
                        <span className="text-sm font-black text-primary">{(log.userEmail || "S").charAt(0).toUpperCase()}</span>
                     </div>
                     <div className="flex flex-col">
                        <span className="text-sm font-bold leading-tight">{log.userEmail || "System"}</span>
                        <Badge variant="outline" className="w-fit text-[8px] font-black uppercase tracking-widest mt-1 border-primary/20 text-primary px-1.5 h-4">
                           {log.userRole || "Admin"}
                        </Badge>
                     </div>
                  </div>
                )
              },
              {
                key: "action",
                label: "Action",
                render: (log) => (
                  <code className="text-[10px] font-black bg-primary/5 px-3 py-1 rounded-xl border border-primary/10 text-primary">
                    {log.action}
                  </code>
                )
              },
              {
                key: "severity",
                label: "Severity",
                render: (log) => (
                  <Badge className={cn("text-[10px] font-black uppercase tracking-widest px-3 h-7 rounded-xl", severityColors[log.severity as keyof typeof severityColors])}>
                    {log.severity}
                  </Badge>
                )
              },
              {
                key: "details",
                label: "Analysis",
                render: (log) => (
                  <div className="flex justify-end">
                    <Sheet>
                      <SheetTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-primary hover:text-primary-foreground transition-all">
                          <ChevronRight className="h-5 w-5" />
                        </Button>
                      </SheetTrigger>
                      <SheetContent className="sm:max-w-xl w-full bg-card/95 backdrop-blur-2xl border-l-white/5">
                        <SheetHeader className="mb-10 border-b border-white/5 pb-8">
                          <div className="flex items-center gap-6 mb-6">
                            <div className={cn("p-4 rounded-3xl shadow-2xl shadow-black/20", severityColors[log.severity as keyof typeof severityColors])}>
                              <Shield className="h-8 w-8" />
                            </div>
                            <div className="flex flex-col items-start text-left space-y-1">
                              <SheetTitle className="text-3xl font-black tracking-tighter uppercase italic">{log.action}</SheetTitle>
                              <SheetDescription className="text-xs font-black uppercase tracking-widest text-muted-foreground opacity-60">Audit Entry • Event #{log.id}</SheetDescription>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                             <Badge variant="outline" className="gap-2 font-bold uppercase tracking-widest text-[9px] h-8 px-4 rounded-xl border-white/10"><Calendar className="h-3.5 w-3.5" /> {format(new Date(log.createdAt), "PPpp")}</Badge>
                             <Badge variant="outline" className="gap-2 font-bold uppercase tracking-widest text-[9px] h-8 px-4 rounded-xl border-white/10"><User className="h-3.5 w-3.5" /> {log.userEmail || "System"}</Badge>
                             <div className="flex items-center gap-2 px-4 py-1 rounded-xl border border-white/10 text-[9px] font-black uppercase tracking-widest bg-muted/30">
                               {statusIcons[log.status as keyof typeof statusIcons]}
                               {log.status}
                             </div>
                          </div>
                        </SheetHeader>

                        <div className="space-y-10">
                          <div className="p-6 rounded-[2rem] bg-muted/20 border border-white/5">
                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-4">Description</h4>
                            <p className="text-xl font-bold leading-snug">{log.description}</p>
                          </div>

                          <div className="grid grid-cols-2 gap-8 px-2">
                             <div>
                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-2">Target Type</h4>
                                <p className="font-black text-sm text-primary uppercase">{log.targetType || "N/A"}</p>
                             </div>
                             <div>
                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-2">Target Identifier</h4>
                                <p className="font-bold font-mono text-sm opacity-60">{log.targetId ? `#${log.targetId}` : "—"}</p>
                             </div>
                             <div className="col-span-2">
                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-2">Origin IP</h4>
                                <p className="font-black font-mono text-sm tracking-widest">{log.ipAddress || "::1"}</p>
                             </div>
                          </div>

                          <div className="space-y-6">
                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground px-2">Payload Delta</h4>
                            <div className="grid gap-6">
                              {log.oldValue && (
                                <div className="rounded-[2rem] border border-white/5 bg-muted/30 p-6 shadow-inner">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50 mb-4 italic">Previous State</p>
                                  <pre className="text-[11px] font-mono whitespace-pre-wrap leading-relaxed opacity-60 max-h-40 overflow-y-auto thin-scrollbar">
                                    {JSON.stringify(JSON.parse(log.oldValue), null, 2)}
                                  </pre>
                                </div>
                              )}
                              {log.newValue && (
                                <div className="rounded-[2rem] border border-primary/20 bg-primary/5 p-6 shadow-2xl shadow-primary/5">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-primary/70 mb-4 italic">New State</p>
                                  <pre className="text-[11px] font-mono whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto thin-scrollbar">
                                    {JSON.stringify(JSON.parse(log.newValue), null, 2)}
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
                        <Badge className={cn("text-[8px] h-5 font-black uppercase", severityColors[log.severity as keyof typeof severityColors])}>
                           {log.severity}
                        </Badge>
                        <span className="text-[10px] font-mono opacity-50">{format(new Date(log.createdAt), "HH:mm:ss")}</span>
                     </div>
                     <code className="text-[10px] text-primary font-bold">{log.action}</code>
                  </div>
                  <div>
                     <p className="text-xs font-black mb-1">{log.userEmail || "System"}</p>
                     <p className="text-sm font-medium leading-relaxed italic opacity-80">"{log.description}"</p>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-white/5">
                     <span className="text-[10px] font-bold uppercase tracking-widest opacity-30">{log.targetType}</span>
                     <Sheet>
                        <SheetTrigger asChild>
                          <Button variant="outline" size="sm" className="h-8 rounded-xl text-[10px] font-black uppercase tracking-widest border-white/10">Details</Button>
                        </SheetTrigger>
                        {/* Mobile Sheet Content (Same as Desktop for consistency) */}
                        <SheetContent side="bottom" className="h-[90vh] rounded-t-[3rem] bg-card/95 backdrop-blur-2xl border-t-white/10 overflow-y-auto px-6">
                           <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-10 opacity-20" />
                           {/* Simplified details for mobile */}
                           <div className="space-y-8 pb-12">
                              <div className="flex items-center gap-4">
                                 <div className={cn("p-4 rounded-2xl", severityColors[log.severity as keyof typeof severityColors])}>
                                    <Shield className="h-6 w-6" />
                                 </div>
                                 <h2 className="text-2xl font-black uppercase italic leading-none">{log.action}</h2>
                              </div>
                              <div className="space-y-1">
                                 <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Admin</p>
                                 <p className="font-bold">{log.userEmail || "System"}</p>
                              </div>
                              <div className="space-y-2">
                                 <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Log Entry</p>
                                 <p className="text-lg font-bold italic">"{log.description}"</p>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                 <div className="p-4 rounded-2xl bg-muted/20">
                                    <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground mb-1">Target</p>
                                    <p className="text-xs font-bold truncate">{log.targetLabel || log.targetType || "—"}</p>
                                 </div>
                                 <div className="p-4 rounded-2xl bg-muted/20">
                                    <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground mb-1">IP Address</p>
                                    <p className="text-xs font-bold font-mono truncate">{log.ipAddress || "::1"}</p>
                                 </div>
                              </div>
                              {log.newValue && (
                                 <div className="space-y-3">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-primary">New State Delta</p>
                                    <pre className="text-[10px] font-mono bg-primary/5 p-4 rounded-2xl border border-primary/10 overflow-x-auto">
                                       {JSON.stringify(JSON.parse(log.newValue), null, 2)}
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
