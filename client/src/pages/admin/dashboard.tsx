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
  Crown,
  Trophy,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useAuth } from "@/hooks/use-auth";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { type User, type Report } from "@shared/schema";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { BulkActionToolbar } from "@/components/admin/BulkActionToolbar";
import { BulkActionModal } from "@/components/admin/BulkActionModal";

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
    <Card className="overflow-hidden border border-white/5 shadow-2xl transition-all hover:-translate-y-1 group glass-premium relative">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
      <CardContent className="p-8 relative z-10">
        <div className="flex items-center justify-between space-y-0 pb-4">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground group-hover:text-primary transition-colors duration-500">
            {title}
          </p>
          <div className={cn(
            "h-10 w-10 rounded-xl flex items-center justify-center transition-all duration-500 shadow-lg",
            priority === "critical" ? "bg-red-500/10 text-red-500 shadow-red-500/10" : 
            priority === "success" ? "bg-emerald-500/10 text-emerald-500 shadow-emerald-500/10" : 
            "bg-primary/10 text-primary shadow-primary/10 group-hover:bg-primary group-hover:text-primary-foreground group-hover:scale-110"
          )}>
            <Icon className="h-5 w-5 stroke-[2.5px]" />
          </div>
        </div>
        <div className="flex items-baseline gap-3">
          <div className="text-4xl font-black tracking-tight italic italic-primary leading-none px-2 -ml-2">{value}</div>
          {trend !== undefined && (
            <span className={cn(
              "text-[10px] font-black px-2 py-1 rounded-full flex items-center gap-1 shadow-sm border border-white/5",
              trend > 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
            )}>
              <TrendingUp className={cn("h-3 w-3", trend < 0 && "rotate-180")} />
              {Math.abs(trend)}%
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-4 font-medium leading-relaxed opacity-60">
          {description}
        </p>
      </CardContent>
      <div className={cn(
        "h-1.5 w-full absolute bottom-0 left-0 opacity-40 transition-all duration-500",
        priority === "critical" ? "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" : 
        priority === "success" ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" : 
        "bg-primary shadow-[0_0_10px_rgba(var(--primary),0.5)] group-hover:h-2"
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

import { ResponsiveTable } from "@/components/ui/responsive-table";

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
  const [reportFilter, setReportFilter] = useState<"all" | "pending" | "resolved" | "rejected">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<Set<number>>(new Set());
  const [selectedReports, setSelectedReports] = useState<Set<number>>(new Set());
  const [bulkAction, setBulkAction] = useState<{ type: "users" | "reports", actionId: string } | null>(null);
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
      const res = await apiRequest("DELETE", `/api/admin/users/${userId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: t("common.success"), description: "User permanently deleted." });
    },
    onError: (error: Error) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
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
    .toSorted((a, b) => {
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
      data: { verified: currentVerified ? 0 : 1 }
    });
  };

  const handleRoleChange = (userId: number, currentRole: string) => {
    const roles: ("user" | "admin" | "owner")[] = ["user", "admin", "owner"];
    const currentIndex = roles.indexOf(currentRole as any);
    const nextRole = roles[(currentIndex + 1) % roles.length];
    
    // Safety check for owner promotion already in backend, but good to have UI hint
    if (nextRole === "owner" && user?.role !== "owner") {
      toast({ title: "Access Denied", description: "Only system owners can promote to Owner status.", variant: "destructive" });
      return;
    }

    updateUserMutation.mutate({ userId, data: { role: nextRole } });
  };

  const handleBanToggle = async (u: User) => {
    const isBanned = u.karma < 0;
    if (isBanned) {
      // Unban: Reset karma to 0
      updateUserMutation.mutate({ userId: u.id, data: { karma: 0 } });
    } else {
      // Simple Ban: Set karma to -9999
      updateUserMutation.mutate({ userId: u.id, data: { karma: -9999 } });
    }
  };

  const handleShadowBanToggle = async (u: User) => {
    updateUserMutation.mutate({ userId: u.id, data: { isShadowBanned: u.isShadowBanned ? 0 : 1 } });
  };

  const toggleUserSelection = (id: number) => {
    const next = new Set(selectedUsers);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedUsers(next);
  };


  const handleBulkAction = async (reason: string, duration?: number) => {
    if (!bulkAction) return;

    if (bulkAction.type === "users") {
       await apiRequest("POST", "/api/admin/bulk/users", {
           user_ids: Array.from(selectedUsers),
           action: bulkAction.actionId,
           reason,
           duration_hours: duration
       });
       setSelectedUsers(new Set());
       queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    } else if (bulkAction.type === "reports") {
       await apiRequest("POST", "/api/admin/bulk/reports", {
           report_ids: Array.from(selectedReports),
           action: bulkAction.actionId,
           reason
       });
       setSelectedReports(new Set());
       queryClient.invalidateQueries({ queryKey: ["/api/admin/reports"] });
       queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    }

    toast({ title: t("bulk.success", "Bulk action executed successfully.") });
    setBulkAction(null);
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
    <TooltipProvider>
        <div className="space-y-12 animate-in fade-in duration-700 pb-20 pt-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-primary">
                <Shield className="h-5 w-5 stroke-[2.5px]" />
                <span className="text-[10px] font-black uppercase tracking-[0.4em]">{t("admin.title")}</span>
              </div>
              <h2 className="text-5xl md:text-7xl font-black tracking-tighter uppercase italic leading-none">
                Command <span className="text-transparent bg-clip-text bg-gradient-to-br from-primary to-accent">Center</span>
              </h2>
              <p className="text-lg text-muted-foreground/60 font-medium max-w-md">Monitor platform health and manage operations in zero-gravity.</p>
            </div>
            
            <div className="flex items-center gap-4">
               <div className="h-14 w-14 rounded-2xl glass-premium border-white/5 flex items-center justify-center shadow-xl">
                 <Activity className="h-6 w-6 text-primary animate-pulse" />
               </div>
            </div>
          </div>

          {/* Statistics Grid */}
          <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
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
            className="space-y-10"
            onValueChange={(value) => {
              setLocation(value === "users" ? "/admin/users" : "/admin/reports");
              if (value === "users") queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
              else if (value === "reports") queryClient.invalidateQueries({ queryKey: ["/api/admin/reports"] });
            }}
          >
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8 border-b border-white/5 pb-8">
              <TabsList className="bg-background/40 backdrop-blur-3xl p-1.5 rounded-full border border-white/10 h-14">
                <TabsTrigger value="users" className="relative flex items-center gap-3 px-8 h-11 rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xl data-[state=active]:shadow-primary/20 transition-all text-[10px] font-black uppercase tracking-widest z-10">
                  <Users className="h-4 w-4" />
                  {t("admin.tabs.users")}
                  <span className={cn("ml-2 px-2 py-0.5 rounded-full text-[9px] font-black transition-colors", currentTab === "users" ? "bg-white/20" : "bg-primary/10 text-primary")}>
                    {users?.length || 0}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="reports" className="relative flex items-center gap-3 px-8 h-11 rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xl data-[state=active]:shadow-primary/20 transition-all text-[10px] font-black uppercase tracking-widest z-10">
                  <Flag className="h-4 w-4" />
                  {t("admin.tabs.reports")}
                  {stats?.pendingReports && stats.pendingReports > 0 ? (
                    <span className="ml-2 px-2 py-0.5 rounded-full bg-red-500/20 text-red-500 text-[9px] font-black animate-pulse">
                      {stats.pendingReports}
                    </span>
                  ) : (
                    <span className={cn("ml-2 px-2 py-0.5 rounded-full text-[9px] font-black transition-colors", currentTab === "reports" ? "bg-white/20" : "bg-primary/10 text-primary")}>
                      {reports?.length || 0}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              <div className="flex items-center gap-4 w-full lg:w-auto">
                <div className="relative flex-1 lg:w-80 group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-all duration-300" />
                  <Input
                    placeholder="Search the Verse..."
                    className="glass-input pl-11 h-14 rounded-full border-white/10 focus-visible:ring-primary shadow-2xl shadow-black/10 font-bold text-xs"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
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
                  <ResponsiveTable<User>
                    keyField="id"
                    columns={[
                      { 
                        key: "selection", 
                        label: "", 
                        render: (u) => (
                          <Checkbox 
                            checked={selectedUsers.has(u.id)}
                            onCheckedChange={() => toggleUserSelection(u.id)}
                          />
                        )
                      },
                      { 
                        key: "username", 
                        label: "User", 
                        render: (u) => (
                          <div className="flex items-center gap-3 py-1">
                            <UserAvatar user={{ username: u.username }} size="sm" />
                            <div className="flex flex-col min-w-0">
                              <Link href={`/users/${u.username}`} className="hover:text-primary transition-colors text-sm font-bold truncate leading-tight">{u.username}</Link>
                              <span className="text-[9px] font-mono text-muted-foreground">ID: {u.id}</span>
                            </div>
                          </div>
                        )
                      },
                      { key: "email", label: "Contact", render: (u) => <span className="text-[11px] font-mono">{u.email}</span> },
                      { 
                        key: "role", 
                        label: "Role", 
                        render: (u) => (
                          <Badge variant={u.role === "owner" ? "destructive" : u.role === "admin" ? "default" : "secondary"} className="text-[9px] py-0 font-bold tracking-wider">
                            {u.role.toUpperCase()}
                          </Badge>
                        )
                      },
                      { 
                        key: "karma", 
                        label: "Rep", 
                        render: (u) => (
                          <div className={cn("inline-flex items-center gap-1 text-xs font-black px-1.5 py-0.5 rounded border shadow-sm", 
                            u.karma >= 0 ? "bg-emerald-500/5 text-emerald-600 border-emerald-500/20" : "bg-red-500/5 text-red-500 border-red-500/20")}>
                            {u.karma >= 0 ? "+" : ""}{u.karma}
                          </div>
                        )
                      },
                      { 
                        key: "actions", 
                        label: "Operations", 
                        render: (u) => (
                          <div className="flex items-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-primary/10 hover:text-primary transition-all" onClick={() => handleVerificationToggle(u.id, !!u.verified)}>
                                  <BadgeCheck className={cn("h-4 w-4", u.verified ? "text-primary fill-primary/20" : "opacity-30")} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{u.verified ? "Revoke Verification" : "Verify User"}</TooltipContent>
                            </Tooltip>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-white/10 transition-all">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56 glass-premium border-white/10 rounded-2xl shadow-2xl p-2">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <DropdownMenuItem className="rounded-xl gap-3 py-3 cursor-pointer" onSelect={(e) => e.preventDefault()}>
                                      <Shield className="h-4 w-4 text-primary" />
                                      <div className="flex flex-col flex-1">
                                        <span className="text-[10px] font-black uppercase tracking-widest">Assign Role</span>
                                        <span className="text-[9px] text-muted-foreground">Currently: {u.role.toUpperCase()}</span>
                                      </div>
                                      <ArrowRight className="h-3 w-3 opacity-30" />
                                    </DropdownMenuItem>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent side="right" className="glass-premium border-white/10 rounded-xl p-2 shadow-2xl">
                                    <DropdownMenuItem className="rounded-lg gap-2 text-[10px] font-black uppercase tracking-widest py-2" onClick={() => updateUserMutation.mutate({ userId: u.id, data: { role: "user" } })}>
                                      <Users className="h-3 w-3" /> User
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="rounded-lg gap-2 text-[10px] font-black uppercase tracking-widest py-2" onClick={() => updateUserMutation.mutate({ userId: u.id, data: { role: "admin" } })}>
                                      <Shield className="h-3 w-3 text-primary" /> Admin
                                    </DropdownMenuItem>
                                    {user?.role === "owner" && (
                                      <DropdownMenuItem className="rounded-lg gap-2 text-[10px] font-black uppercase tracking-widest py-2 text-primary" onClick={() => updateUserMutation.mutate({ userId: u.id, data: { role: "owner" } })}>
                                        <Crown className="h-3 w-3" /> Owner
                                      </DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                                
                                <DropdownMenuItem className="rounded-xl gap-3 py-3 cursor-pointer" onClick={() => handleShadowBanToggle(u)}>
                                  <UserX className={cn("h-4 w-4", u.isShadowBanned ? "text-amber-500" : "text-muted-foreground")} />
                                  <div className="flex flex-col">
                                    <span className="text-[10px] font-black uppercase tracking-widest">
                                      {u.isShadowBanned ? "Revoke Shadowban" : "Shadowban User"}
                                    </span>
                                    <span className="text-[9px] text-muted-foreground">Silent moderation state</span>
                                  </div>
                                </DropdownMenuItem>

                                <DropdownMenuItem className="rounded-xl gap-3 py-3 cursor-pointer text-red-500 hover:text-red-500 hover:bg-red-500/10" onClick={() => handleBanToggle(u)}>
                                  <Ban className="h-4 w-4" />
                                  <div className="flex flex-col">
                                    <span className="text-[10px] font-black uppercase tracking-widest">
                                      {u.karma < 0 ? "Lift Restriction" : "Restrict Account"}
                                    </span>
                                    <span className="text-[9px] opacity-70">{u.karma < 0 ? "Restore access" : "Zero-gravity suspension"}</span>
                                  </div>
                                </DropdownMenuItem>

                                <div className="h-[1px] bg-white/5 my-2" />

                                <DropdownMenuItem className="rounded-xl gap-3 py-3 cursor-pointer text-red-600 hover:text-red-600 hover:bg-red-600/10 font-bold" onClick={() => deleteUserMutation.mutate(u.id)}>
                                  <Trash2 className="h-4 w-4" />
                                  <span className="text-[10px] font-black uppercase tracking-widest text-red-500">Purge Entity</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        )
                      }
                    ]}
                    data={filteredUsers || []}
                    renderMobileCard={(u) => (
                      <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <UserAvatar user={{ username: u.username }} size="sm" />
                            <div>
                              <p className="font-bold text-sm">{u.username}</p>
                              <p className="text-[10px] text-muted-foreground font-mono">{u.email}</p>
                            </div>
                          </div>
                          <Checkbox 
                            checked={selectedUsers.has(u.id)}
                            onCheckedChange={() => toggleUserSelection(u.id)}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex gap-2">
                             <Badge variant={u.role === "owner" ? "destructive" : "secondary"} className="text-[9px]">{u.role.toUpperCase()}</Badge>
                             <div className={cn("text-[10px] font-black px-1.5 rounded border", u.karma >= 0 ? "text-emerald-600" : "text-red-500")}>
                               {u.karma >= 0 ? "+" : ""}{u.karma}
                             </div>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={() => handleVerificationToggle(u.id, !!u.verified)}>
                              {u.verified ? "Verified" : "Verify"}
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56 glass-premium border-white/10 rounded-2xl shadow-2xl p-2">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <DropdownMenuItem className="rounded-xl gap-3 py-3 cursor-pointer" onSelect={(e) => e.preventDefault()}>
                                      <Shield className="h-4 w-4 text-primary" />
                                      <span className="text-[10px] font-black uppercase tracking-widest flex-1">Assign Role</span>
                                      <ArrowRight className="h-3 w-3 opacity-30" />
                                    </DropdownMenuItem>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent side="right" className="glass-premium border-white/10 rounded-xl p-2 shadow-2xl">
                                    <DropdownMenuItem className="rounded-lg gap-2 text-[10px] font-black uppercase tracking-widest py-2" onClick={() => updateUserMutation.mutate({ userId: u.id, data: { role: "user" } })}>
                                      <Users className="h-3 w-3" /> User
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="rounded-lg gap-2 text-[10px] font-black uppercase tracking-widest py-2" onClick={() => updateUserMutation.mutate({ userId: u.id, data: { role: "admin" } })}>
                                      <Shield className="h-3 w-3 text-primary" /> Admin
                                    </DropdownMenuItem>
                                    {user?.role === "owner" && (
                                      <DropdownMenuItem className="rounded-lg gap-2 text-[10px] font-black uppercase tracking-widest py-2 text-primary" onClick={() => updateUserMutation.mutate({ userId: u.id, data: { role: "owner" } })}>
                                        <Crown className="h-3 w-3" /> Owner
                                      </DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                                <DropdownMenuItem className="rounded-xl gap-3 py-3 cursor-pointer" onClick={() => handleShadowBanToggle(u)}>
                                  <UserX className={cn("h-4 w-4", u.isShadowBanned ? "text-amber-500" : "text-muted-foreground")} />
                                  <span className="text-[10px] font-black uppercase tracking-widest">Toggle Shadowban</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem className="rounded-xl gap-3 py-3 cursor-pointer text-red-500 hover:bg-red-500/10" onClick={() => handleBanToggle(u)}>
                                  <Ban className="h-4 w-4" />
                                  <span className="text-[10px] font-black uppercase tracking-widest">Toggle Restriction</span>
                                </DropdownMenuItem>
                                <div className="h-[1px] bg-white/5 my-2" />
                                <DropdownMenuItem className="rounded-xl gap-3 py-3 cursor-pointer text-red-600 hover:bg-red-600/10" onClick={() => deleteUserMutation.mutate(u.id)}>
                                  <Trash2 className="h-4 w-4" />
                                  <span className="text-[10px] font-black uppercase tracking-widest">Purge Account</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    )}
                  />
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
                  <ResponsiveTable<AdminReport>
                    keyField="id"
                    columns={[
                      { 
                        key: "source", 
                        label: "Source", 
                        render: (r) => (
                          <div className="flex flex-col">
                            <span className="text-xs font-bold">{(r as any).reporter?.username}</span>
                            <span className="text-[9px] font-mono text-muted-foreground">{r.ipAddress || "INTERNAL"}</span>
                          </div>
                        )
                      },
                      { 
                        key: "entity", 
                        label: "Entity", 
                        render: (r) => (
                          <Badge variant="outline" className="text-[8px] py-0 font-black tracking-tighter border-primary/20 bg-primary/5">
                            {(r as any).content?.type?.toUpperCase()}
                          </Badge>
                        )
                      },
                      { 
                        key: "observation", 
                        label: "Observation", 
                        render: (r) => (
                          <p className="text-xs font-bold truncate max-w-[200px]">{(r as any).content?.title || (r as any).content?.content}</p>
                        )
                      },
                      { 
                        key: "status", 
                        label: "Status", 
                        render: (r) => (
                          <Badge variant={r.status === "resolved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"} className="text-[9px] font-bold">
                            {r.status.toUpperCase()}
                          </Badge>
                        )
                      },
                      { 
                        key: "actions", 
                        label: "Decisions", 
                        render: (r) => (
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" disabled={r.status !== "pending"} onClick={(e) => { e.stopPropagation(); updateReportMutation.mutate({ reportId: r.id, status: "resolved" }); }}>
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" disabled={r.status !== "pending"} onClick={(e) => { e.stopPropagation(); updateReportMutation.mutate({ reportId: r.id, status: "rejected" }); }}>
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        )
                      }
                    ]}
                    data={filteredReports || []}
                    onRowClick={(r) => r.postId && setLocation(`/posts/${r.postId}?from=admin`)}
                    renderMobileCard={(r) => (
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold">{(r as any).reporter?.username}</span>
                            <span className="text-[10px] text-muted-foreground uppercase font-black">{(r as any).content?.type} Flag</span>
                          </div>
                          <Badge variant={r.status === "resolved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"} className="text-[9px]">
                            {r.status.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-xs italic text-muted-foreground line-clamp-2">"{r.reason}"</p>
                        <div className="flex items-center justify-between pt-2 border-t border-border/40">
                          <span className="text-[10px] font-mono text-muted-foreground">{format(new Date(r.createdAt), "MMM d, HH:mm")}</span>
                          <div className="flex gap-2">
                             <Button variant="outline" size="sm" className="h-8 px-3 text-xs text-emerald-600" disabled={r.status !== "pending"} onClick={(e) => { e.stopPropagation(); updateReportMutation.mutate({ reportId: r.id, status: "resolved" }); }}>
                               Resolve
                             </Button>
                             <Button variant="outline" size="sm" className="h-8 px-3 text-xs text-red-500" disabled={r.status !== "pending"} onClick={(e) => { e.stopPropagation(); updateReportMutation.mutate({ reportId: r.id, status: "rejected" }); }}>
                               Dismiss
                             </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <BulkActionToolbar 
            type={currentTab} 
            count={currentTab === "users" ? selectedUsers.size : selectedReports.size} 
            onAction={(actionId) => setBulkAction({ type: currentTab, actionId })}
            onClear={() => currentTab === "users" ? setSelectedUsers(new Set()) : setSelectedReports(new Set())}
          />

          <BulkActionModal 
            isOpen={bulkAction !== null}
            onClose={() => setBulkAction(null)}
            onConfirm={handleBulkAction}
            type={bulkAction?.type || "users"}
            actionId={bulkAction?.actionId || ""}
            count={bulkAction?.type === "users" ? selectedUsers.size : selectedReports.size}
          />
        </div>
      </TooltipProvider>
  );
}
