import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { 
  Users, 
  Flag, 
  Shield, 
  ShieldOff, 
  UserPlus, 
  UserMinus, 
  Ban, 
  Check, 
  AlertTriangle, 
  BadgeCheck, 
  Search,
  Trash2,
  Activity,
  UserCheck,
  UserX,
  MessagesSquare,
  CheckCircle,
  XCircle,
  TrendingUp,
  Filter,
  MoreVertical,
  ArrowRight,
  ChevronRight,
  LayoutDashboard,
  Bell,
  Settings,
  LogOut,
  Home,
  Trophy
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AdminLayout } from "@/components/admin/admin-layout";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useAuth } from "@/hooks/use-auth";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { type User, type Report } from "@shared/schema";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";

function MetricCard({ 
  title, 
  value, 
  icon: Icon, 
  description, 
  trend, 
  priority = "default" 
}: { 
  title: string; 
  value: number | string; 
  icon: any; 
  description: string;
  trend?: number;
  priority?: "default" | "critical" | "success";
}) {
  return (
    <Card className="overflow-hidden border-none shadow-sm transition-all hover:shadow-md hover:-translate-y-1 group bg-card/50 backdrop-blur-sm relative">
      <CardContent className="p-6">
        <div className="flex items-center justify-between space-y-0 pb-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">
            {title}
          </p>
          <div className={cn(
            "p-2 rounded-xl transition-colors",
            priority === "critical" ? "bg-red-500/10 text-red-500" : 
            priority === "success" ? "bg-emerald-500/10 text-emerald-600" : 
            "bg-primary/10 text-primary"
          )}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <div className="text-2xl font-black tracking-tighter">{value}</div>
          {trend && (
            <span className={cn(
              "text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5",
              trend > 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500"
            )}>
              <TrendingUp className={cn("h-3 w-3", trend < 0 && "rotate-180")} />
              {Math.abs(trend)}%
            </span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 font-medium leading-tight">
          {description}
        </p>
      </CardContent>
      <div className={cn(
        "h-1 w-full absolute bottom-0 left-0 opacity-20",
        priority === "critical" ? "bg-red-500" : 
        priority === "success" ? "bg-emerald-500" : 
        "bg-primary"
      )} />
    </Card>
  );
}

function UserRowSkeleton() {
  return (
    <TableRow>
      <TableCell className="px-6"><Skeleton className="h-4 w-4 rounded" /></TableCell>
      <TableCell><div className="flex items-center gap-3"><Skeleton className="h-8 w-8 rounded-full" /><div className="space-y-1"><Skeleton className="h-4 w-24" /><Skeleton className="h-3 w-16" /></div></div></TableCell>
      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
      <TableCell><div className="flex gap-1"><Skeleton className="h-4 w-16" /><Skeleton className="h-4 w-16" /></div></TableCell>
      <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
      <TableCell><Skeleton className="h-6 w-12 rounded" /></TableCell>
      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><div className="flex justify-center gap-1"><Skeleton className="h-7 w-7 rounded" /><Skeleton className="h-7 w-7 rounded" /><Skeleton className="h-7 w-7 rounded" /></div></TableCell>
    </TableRow>
  );
}

function ReportRowSkeleton() {
  return (
    <TableRow>
      <TableCell className="px-6"><div className="space-y-1"><Skeleton className="h-4 w-20" /><Skeleton className="h-3 w-24" /></div></TableCell>
      <TableCell><Skeleton className="h-4 w-12" /></TableCell>
      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><div className="flex justify-center gap-1"><Skeleton className="h-8 w-8 rounded" /><Skeleton className="h-8 w-8 rounded" /></div></TableCell>
    </TableRow>
  );
}

function StatCardSkeleton() {
  return (
    <Card className="border-none shadow-sm"><CardContent className="p-6"><Skeleton className="h-4 w-20 mb-4" /><Skeleton className="h-8 w-24 mb-2" /><Skeleton className="h-3 w-full" /></CardContent></Card>
  );
}

import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";

type AdminReport = Report & {
  reporter?: { username: string };
  content?: {
    type: string;
    title?: string;
    content: string;
    author?: { username: string; id: number };
  };
};

export default function AdminDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [userFilter, setUserFilter] = useState<"all" | "verified" | "banned">("all");
  const [reportFilter, setReportFilter] = useState<"all" | "pending" | "resolved" | "rejected">("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<Set<number>>(new Set());
  const [sortConfig, setSortConfig] = useState<{ key: keyof User; direction: "asc" | "desc" } | null>(null);

  const { data: stats, isLoading: statsLoading } = useQuery<{
    totalUsers: number;
    totalReports: number;
    pendingReports: number;
    activeUsers: number;
    verifiedUsers: number;
    bannedUsers: number;
    totalPosts: number;
    resolvedReports: number;
  }>({
    queryKey: ["/api/admin/stats"],
  });

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: reports, isLoading: reportsLoading } = useQuery<AdminReport[]>({
    queryKey: ["/api/admin/reports"],
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: number; data: Partial<User> }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: t("common.success"), description: t("admin.users_table.update_success") });
    },
    onError: (error: Error) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      await apiRequest("DELETE", `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: t("common.success"), description: t("admin.users_table.delete_success") });
    },
  });

  const updateReportMutation = useMutation({
    mutationFn: async ({ reportId, status }: { reportId: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/reports/${reportId}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: t("common.success"), description: t("admin.reports_table.update_success") });
    },
  });

  const resetRolesMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/reset-roles");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: t("common.success"), description: "Roles have been reset to default" });
    },
  });

  const filteredUsers = (users || [])
    .filter((u) => {
      const matchesSearch =
        u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.email || "").toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      switch (userFilter) {
        case "verified": return u.verified;
        case "banned": return u.karma < 0;
        default: return true;
      }
    })
    .sort((a, b) => {
      if (!sortConfig) return 0;
      const { key, direction } = sortConfig;
      const aValue = (a as any)[key];
      const bValue = (b as any)[key];
      if (aValue < bValue) return direction === "asc" ? -1 : 1;
      if (aValue > bValue) return direction === "asc" ? 1 : -1;
      return 0;
    });

  const filteredReports = reports?.filter((report) => {
    if (reportFilter === "pending") return report.status === "pending";
    if (reportFilter === "resolved") return report.status === "resolved";
    if (reportFilter === "rejected") return report.status === "rejected";
    return true;
  });

  const handleVerificationToggle = async (userId: number, currentVerified: boolean) => {
    updateUserMutation.mutate({
      userId,
      data: { verified: !currentVerified }
    });
  };

  const toggleUserSelection = (id: number) => {
    const next = new Set(selectedUsers);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedUsers(next);
  };

  const handleSort = (key: string) => {
    setSortConfig((prev) => ({
      key: key as keyof User,
      direction: prev?.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  if (!user || (user.role !== "admin" && user.role !== "owner")) {
    return null;
  }

  const currentTab = location === "/admin/reports" ? "reports" : "users";

  return (
    <AdminLayout>
      <TooltipProvider>
        <div className="space-y-8 animate-in fade-in duration-500 pb-12">
          <div className="flex flex-col gap-1">
            <h2 className="text-3xl font-bold tracking-tight">{t("admin.title")}</h2>
            <p className="text-muted-foreground font-medium">Monitor platform health and manage operations.</p>
          </div>

          {/* Statistics Grid */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            {statsLoading ? [...Array(5)].map((_, i) => <StatCardSkeleton key={i} />) : (
              <>
                <MetricCard title={t("admin.stats.total_users")} value={stats?.totalUsers || 0} icon={Users} description="Cumulative registered users across the platform." />
                <MetricCard title={t("admin.stats.total_reports")} value={stats?.totalReports || 0} icon={Flag} description="Total reports flags received across all content." />
                <MetricCard 
                  title={t("admin.stats.pending_reports")} 
                  value={stats?.pendingReports || 0} 
                  icon={AlertTriangle} 
                  priority={stats?.pendingReports && stats.pendingReports > 0 ? "critical" : "success"}
                  description="Awaiting manual review by the administration." 
                />
                <MetricCard title={t("admin.stats.active_users")} value={stats?.activeUsers || 0} icon={Activity} trend={12} description="Unique users active within the last 24 hours." />
                <MetricCard title={t("admin.stats.verified_users")} value={stats?.verifiedUsers || 0} icon={UserCheck} description="Trusted members who completed verification." />
              </>
            )}
          </div>

          <Tabs
            value={currentTab}
            className="space-y-6"
            onValueChange={(value) => {
              setLocation(value === "users" ? "/admin/users" : "/admin/reports");
              if (value === "users") queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
              else if (value === "reports") queryClient.invalidateQueries({ queryKey: ["/api/admin/reports"] });
            }}
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <TabsList className="bg-muted/50 p-1 border">
                <TabsTrigger value="users" className="flex items-center gap-2 px-6 data-[state=active]:bg-card data-[state=active]:shadow-sm transition-all text-xs font-bold uppercase tracking-widest">
                  <Users className="h-4 w-4" />
                  {t("admin.tabs.users")}
                  <Badge variant="secondary" className="ml-1 px-1.5 py-0 h-4 text-[10px] bg-primary/10 text-primary border-none font-black">{users?.length || 0}</Badge>
                </TabsTrigger>
                <TabsTrigger value="reports" className="flex items-center gap-2 px-6 data-[state=active]:bg-card data-[state=active]:shadow-sm transition-all text-xs font-bold uppercase tracking-widest">
                  <Flag className="h-4 w-4" />
                  {t("admin.tabs.reports")}
                  {stats?.pendingReports && stats.pendingReports > 0 ? (
                    <Badge variant="destructive" className="ml-1 px-1.5 py-0 h-4 text-[10px] animate-pulse font-black">{stats.pendingReports}</Badge>
                  ) : (
                    <Badge variant="secondary" className="ml-1 px-1.5 py-0 h-4 text-[10px] font-black">{reports?.length || 0}</Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64 group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    placeholder="Filter current view..."
                    className="pl-9 h-10 bg-card border-muted-foreground/20 focus-visible:ring-primary shadow-sm"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                {selectedUsers.size > 0 && (
                  <Button variant="destructive" size="sm" className="gap-2 shrink-0 h-10 animate-in slide-in-from-right-2 shadow-sm font-bold" onClick={() => { if(window.confirm(`Delete ${selectedUsers.size} users?`)) { /* bulk delete logic */ } }}>
                    <Trash2 className="h-4 w-4" />
                    Delete {selectedUsers.size}
                  </Button>
                )}
              </div>
            </div>

            <TabsContent value="users">
              <Card className="border-none shadow-sm overflow-hidden bg-card/50 backdrop-blur-sm">
                <CardHeader className="bg-card/80 border-b px-6 py-4 flex flex-row items-center justify-between backdrop-blur-md sticky top-0 z-20">
                  <div>
                    <CardTitle className="text-lg font-bold tracking-tight">User Directory</CardTitle>
                    <CardDescription className="text-xs">Manage authentication states and moderation levels.</CardDescription>
                  </div>
                  <div className="flex gap-1 bg-muted/40 p-1 rounded-lg border">
                    <Button variant={userFilter === "all" ? "secondary" : "ghost"} size="sm" className="h-7 text-[10px] uppercase font-bold tracking-widest px-3" onClick={() => setUserFilter("all")}>All</Button>
                    <Button variant={userFilter === "verified" ? "secondary" : "ghost"} size="sm" className="h-7 text-[10px] uppercase font-bold tracking-widest px-3" onClick={() => setUserFilter("verified")}>Verified</Button>
                    <Button variant={userFilter === "banned" ? "secondary" : "ghost"} size="sm" className="h-7 text-[10px] uppercase font-bold tracking-widest px-3" onClick={() => setUserFilter("banned")}>Banned</Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-auto max-h-[calc(100vh-25rem)] scrollbar-thin scrollbar-thumb-muted-foreground/10">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card/95 z-20 backdrop-blur-md shadow-sm border-b">
                        <TableRow className="hover:bg-transparent border-none">
                          <TableHead className="w-[40px] px-6">
                            <Checkbox 
                              checked={selectedUsers.size === filteredUsers?.length && filteredUsers.length > 0}
                              onCheckedChange={(checked) => {
                                if (checked) setSelectedUsers(new Set(filteredUsers?.map(u => u.id)));
                                else setSelectedUsers(new Set());
                              }}
                            />
                          </TableHead>
                          <TableHead className="cursor-pointer group px-4 py-3" onClick={() => handleSort("username")}>
                            <div className="flex items-center gap-1 group-hover:text-foreground transition-colors font-bold uppercase tracking-widest text-[10px]">
                              User
                              <TrendingUp className={cn("h-3 w-3 opacity-0 group-hover:opacity-100 transition-all", sortConfig?.key === "username" ? "opacity-100" : "")} />
                            </div>
                          </TableHead>
                          <TableHead className="font-bold uppercase tracking-widest text-[10px]">Contact Info</TableHead>
                          <TableHead className="font-bold uppercase tracking-widest text-[10px]">Verification States</TableHead>
                          <TableHead className="cursor-pointer group font-bold uppercase tracking-widest text-[10px]" onClick={() => handleSort("role")}>
                            <div className="flex items-center gap-1">
                              System Role <TrendingUp className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                            </div>
                          </TableHead>
                          <TableHead className="cursor-pointer group font-bold uppercase tracking-widest text-[10px]" onClick={() => handleSort("karma")}>
                            <div className="flex items-center gap-1">
                              Reputation <TrendingUp className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                            </div>
                          </TableHead>
                          <TableHead className="font-bold uppercase tracking-widest text-[10px]">Onboarded</TableHead>
                          <TableHead className="sticky right-0 bg-card/95 backdrop-blur-md border-l text-center w-[150px] font-bold uppercase tracking-widest text-[10px]">Operations</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {usersLoading ? [...Array(10)].map((_, i) => <UserRowSkeleton key={i} />) : 
                         filteredUsers?.map((u) => (
                          <TableRow key={u.id} className="hover:bg-muted/40 transition-colors group border-b/50">
                            <TableCell className="px-6">
                              <Checkbox 
                                checked={selectedUsers.has(u.id)}
                                onCheckedChange={() => toggleUserSelection(u.id)}
                              />
                            </TableCell>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-3 py-1">
                                <UserAvatar user={{ username: u.username }} size="sm" />
                                <div className="flex flex-col min-w-0">
                                  <Link href={`/users/${u.username}`} className="hover:text-primary transition-colors text-sm font-bold truncate leading-tight">{u.username}</Link>
                                  {u.verified && <span className="text-[9px] text-primary font-black uppercase tracking-tighter mt-0.5">Verified Partner</span>}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-[11px] text-muted-foreground font-mono">{u.email}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {u.emailVerified ? (
                                  <Badge variant="outline" className="text-[8px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20 py-0 font-bold">EMAIL_ACTIVE</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[8px] bg-muted/20 text-muted-foreground py-0 font-bold border-muted/30">PENDING_EMAIL</Badge>
                                )}
                                {u.karma < 0 && <Badge variant="destructive" className="text-[8px] py-0 px-1 font-black animate-pulse">RESTRICTED</Badge>}
                              </div>
                            </TableCell>
                            <TableCell>
                               <Badge variant={u.role === "owner" ? "destructive" : u.role === "admin" ? "default" : "secondary"} className="text-[9px] py-0 font-bold tracking-wider">
                                 {u.role.toUpperCase()}
                               </Badge>
                            </TableCell>
                            <TableCell>
                              <div className={cn("inline-flex items-center gap-1 text-xs font-black px-1.5 py-0.5 rounded border shadow-sm", 
                                u.karma >= 0 ? "bg-emerald-500/5 text-emerald-600 border-emerald-500/20" : "bg-red-500/5 text-red-500 border-red-500/20")}>
                                {u.karma >= 0 ? "+" : ""}{u.karma}
                              </div>
                            </TableCell>
                            <TableCell className="text-[10px] text-muted-foreground font-bold whitespace-nowrap">
                              {u.createdAt ? format(new Date(u.createdAt), "MMM d, yyyy") : "—"}
                            </TableCell>
                            <TableCell className="sticky right-0 bg-card group-hover:bg-muted/60 transition-colors border-l shadow-[-4px_0_12px_rgba(0,0,0,0.02)]">
                              <div className="flex items-center justify-center gap-0.5 px-2">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary transition-all hover:bg-background" 
                                            onClick={() => handleVerificationToggle(u.id, u.verified)}>
                                      <BadgeCheck className={cn("h-4 w-4", u.verified ? "text-primary" : "")} />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">Toggle Verification</TooltipContent>
                                </Tooltip>

                                <AlertDialog>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-500 transition-all hover:bg-background">
                                          <Ban className={cn("h-4 w-4", u.karma < 0 ? "text-red-600" : "")} />
                                        </Button>
                                      </AlertDialogTrigger>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">Access Control</TooltipContent>
                                  </Tooltip>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle className="font-bold">{u.karma < 0 ? "Restore" : "Ban"} {u.username}?</AlertDialogTitle>
                                      <AlertDialogDescription className="text-sm">
                                        {u.karma < 0 ? `This will restore regular platform access for ${u.username}.` : `This will restrict access for ${u.username} indefinitely. Reputation reset to -100.`}
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel className="font-bold">Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => {
                                        const newKarma = u.karma < 0 ? 5 : -100;
                                        updateUserMutation.mutate({ userId: u.id, data: { karma: newKarma } });
                                      }} className={cn("font-bold shadow-sm", u.karma < 0 ? "" : "bg-red-600 hover:bg-red-700")}>
                                        {u.karma < 0 ? "Restore Access" : "Confirm Sanction"}
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                                
                                <AlertDialog>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-600 transition-all hover:bg-background">
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </AlertDialogTrigger>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">Permanent Delete</TooltipContent>
                                  </Tooltip>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle className="font-bold text-red-600">CRITICAL: Data Purge</AlertDialogTitle>
                                      <AlertDialogDescription className="text-sm font-medium">
                                        Permanently delete {u.username} and all associated data metadata? This action is IRREVERSIBLE.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel className="font-bold">Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => deleteUserMutation.mutate(u.id)} className="bg-red-600 hover:bg-red-700 font-bold shadow-sm">Execute Purge</AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="reports">
               <Card className="border-none shadow-sm overflow-hidden bg-card/50 backdrop-blur-sm">
                <CardHeader className="bg-card/80 border-b px-6 py-4 flex flex-row items-center justify-between backdrop-blur-md sticky top-0 z-20">
                  <div>
                    <CardTitle className="text-lg font-bold tracking-tight">Content Integrity Queue</CardTitle>
                    <CardDescription className="text-xs">Community flags requiring administrative adjudication.</CardDescription>
                  </div>
                  <div className="flex gap-1 bg-muted/40 p-1 rounded-lg border">
                    <Button variant={reportFilter === "pending" ? "secondary" : "ghost"} size="sm" className="h-7 text-[10px] uppercase font-bold tracking-widest px-3" onClick={() => setReportFilter("pending")}>Pending</Button>
                    <Button variant={reportFilter === "resolved" ? "secondary" : "ghost"} size="sm" className="h-7 text-[10px] uppercase font-bold tracking-widest px-3" onClick={() => setReportFilter("resolved")}>Resolved</Button>
                    <Button variant={reportFilter === "rejected" ? "secondary" : "ghost"} size="sm" className="h-7 text-[10px] uppercase font-bold tracking-widest px-3" onClick={() => setReportFilter("rejected")}>Rejected</Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-auto max-h-[calc(100vh-25rem)] scrollbar-thin scrollbar-thumb-muted-foreground/10">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card/95 z-20 backdrop-blur-md shadow-sm border-b">
                        <TableRow className="hover:bg-transparent border-none">
                          <TableHead className="w-[140px] px-6 font-bold uppercase tracking-widest text-[10px]">Source</TableHead>
                          <TableHead className="w-[100px] font-bold uppercase tracking-widest text-[10px]">Entity</TableHead>
                          <TableHead className="font-bold uppercase tracking-widest text-[10px]">Observation</TableHead>
                          <TableHead className="font-bold uppercase tracking-widest text-[10px]">Justification</TableHead>
                          <TableHead className="w-[100px] font-bold uppercase tracking-widest text-[10px]">Status</TableHead>
                          <TableHead className="w-[150px] font-bold uppercase tracking-widest text-[10px]">Timestamp</TableHead>
                          <TableHead className="sticky right-0 bg-card/95 backdrop-blur-md border-l text-center w-[120px] font-bold uppercase tracking-widest text-[10px]">Decisions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reportsLoading ? [...Array(5)].map((_, i) => <ReportRowSkeleton key={i} />) : 
                         filteredReports?.map((r) => (
                           <TableRow key={r.id} className={cn(
                             "hover:bg-muted/40 transition-colors group border-b/50",
                             r.status === "pending" ? "font-bold bg-primary/5" : "text-muted-foreground opacity-60"
                           )} onClick={() => r.postId && setLocation(`/posts/${r.postId}?from=admin`)}>
                             <TableCell className="px-6">
                               <div className="flex flex-col">
                                 <span className="text-xs font-bold text-foreground">{(r as any).reporter?.username}</span>
                                 <span className="text-[9px] font-mono text-muted-foreground bg-muted p-0.5 rounded w-fit mt-1">{r.ipAddress || "INTERNAL"}</span>
                               </div>
                             </TableCell>
                             <TableCell>
                               <Badge variant="outline" className="text-[8px] py-0 font-black tracking-tighter border-primary/20 bg-primary/5">
                                 {(r as any).content?.type?.toUpperCase()}
                               </Badge>
                             </TableCell>
                             <TableCell className="max-w-[250px]">
                               <p className="text-xs font-bold truncate leading-none mb-1 text-foreground">{(r as any).content?.title || (r as any).content?.content}</p>
                               <span className="text-[9px] text-muted-foreground uppercase tracking-widest font-black">Author: {(r as any).content?.author?.username}</span>
                             </TableCell>
                             <TableCell className="text-xs italic border-l pl-3">"{r.reason}"</TableCell>
                             <TableCell>
                               <Badge variant={r.status === "resolved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"} className="text-[9px] font-bold tracking-wider">
                                 {r.status.toUpperCase()}
                               </Badge>
                             </TableCell>
                             <TableCell className="text-[10px] font-bold text-muted-foreground font-mono">
                               {format(new Date(r.createdAt), "MMM d, HH:mm")}
                             </TableCell>
                             <TableCell className="sticky right-0 bg-card group-hover:bg-muted/60 transition-colors border-l shadow-[-4px_0_12px_rgba(0,0,0,0.02)]" onClick={(e) => e.stopPropagation()}>
                               <div className="flex items-center justify-center gap-1">
                                 <Tooltip>
                                   <TooltipTrigger asChild>
                                     <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-emerald-600 transition-all hover:bg-background" 
                                             disabled={r.status !== "pending"}
                                             onClick={() => updateReportMutation.mutate({ reportId: r.id, status: "resolved" })}>
                                       <CheckCircle className="h-4 w-4" />
                                     </Button>
                                   </TooltipTrigger>
                                   <TooltipContent side="top">Resolve Flag</TooltipContent>
                                 </Tooltip>

                                 <Tooltip>
                                   <TooltipTrigger asChild>
                                     <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-500 transition-all hover:bg-background" 
                                             disabled={r.status !== "pending"}
                                             onClick={() => updateReportMutation.mutate({ reportId: r.id, status: "rejected" })}>
                                       <XCircle className="h-4 w-4" />
                                     </Button>
                                   </TooltipTrigger>
                                   <TooltipContent side="top">Dismiss Flag</TooltipContent>
                                 </Tooltip>
                               </div>
                             </TableCell>
                           </TableRow>
                         ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </TooltipProvider>
    </AdminLayout>
  );
}
