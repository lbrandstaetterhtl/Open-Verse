import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Users, Flag, Shield, ShieldOff, UserPlus, UserMinus, Ban, Check, AlertTriangle, BadgeCheck, Search, Trash2, Activity, UserCheck, UserX, MessagesSquare, CheckCircle2, XCircle, TrendingUp, Filter, MoreHorizontal, ArrowRight, Crown, Trophy, X } from "lucide-react";

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
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/page-header";
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
import type { User, Report } from "@shared/schema";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { BulkActionToolbar } from "@/staff/components/admin/BulkActionToolbar";
import { BulkActionModal } from "@/staff/components/admin/BulkActionModal";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3 pb-3">
          <p className="ov-label">
            {title}
          </p>
          <div className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-sm",
            priority === "critical" ? "bg-star/10 text-star" :
            priority === "success" ? "bg-primary/10 text-primary" :
            "bg-primary/10 text-primary"
          )}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-3">
          <div className={cn("ov-data text-3xl font-semibold leading-none", priority === "critical" && "text-star")}>{value}</div>
          {trend !== undefined && (
            <span className={cn(
              "ov-chip ov-data h-5 gap-1 px-1.5 text-xs",
              trend > 0 ? "ov-chip-success" : "ov-chip-danger"
            )}>
              <TrendingUp className={cn("h-3 w-3", trend < 0 && "rotate-180")} />
              {Math.abs(trend)}%
            </span>
          )}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}

function UserRowSkeleton() {
  return (
    <TableRow>
      <TableCell className="px-6"><Skeleton className="h-4 w-4 rounded" /></TableCell>
      <TableCell><div className="flex items-center gap-3"><Skeleton className="ov-avatar h-8 w-8" /><div className="space-y-1"><Skeleton className="h-4 w-24" /><Skeleton className="h-3 w-16" /></div></div></TableCell>
      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
      <TableCell><div className="flex gap-1"><Skeleton className="h-4 w-16" /><Skeleton className="h-4 w-16" /></div></TableCell>
      <TableCell><Skeleton className="h-5 w-16 rounded-pill" /></TableCell>
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
    <Card><CardContent className="p-5"><Skeleton className="h-4 w-20 mb-4" /><Skeleton className="h-8 w-24 mb-2" /><Skeleton className="h-3 w-full" /></CardContent></Card>
  );
}

import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";

import { ResponsiveTable } from "@/components/ui/responsive-table";
import { GroupsManagement } from "@/staff/components/admin/GroupsManagement";
import { ListPager } from "@/staff/components/admin/ListPager";
import { useAdminList, useDebounced, ADMIN_PAGE_SIZE } from "@/staff/hooks/use-admin-list";

import { useDateLocale } from "@/lib/date-locale";
/** /api/admin/users rows: the user plus whether an account ban is active (karma is reputation only). */
type AdminUser = User & { isBanned?: boolean };

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
  const dateLocale = useDateLocale();
  const { user, hasPermission } = useAuth();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [userFilter, setUserFilter] = useState<"all" | "verified" | "banned">("all");
  const [reportFilter, setReportFilter] = useState<"all" | "pending" | "resolved" | "rejected">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<Set<number>>(new Set());
  const [selectedReports, setSelectedReports] = useState<Set<number>>(new Set());
  const [bulkAction, setBulkAction] = useState<{ type: "users" | "reports", actionId: string } | null>(null);
  // Permanent deletion is confirmed in a dialog first
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  // Restricting (account ban) asks for a reason first
  const [userToBan, setUserToBan] = useState<AdminUser | null>(null);
  const [banReason, setBanReason] = useState("");
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

  // Server-paged lists (?limit/&offset, total in X-Total-Count); the user search runs on the server
  const [userPage, setUserPage] = useState(0);
  const [reportPage, setReportPage] = useState(0);
  const userSearch = useDebounced(searchQuery.trim());
  useEffect(() => setUserPage(0), [userSearch]);
  useEffect(() => setReportPage(0), [reportFilter]);
  const { data: usersPage, isLoading: usersLoading } = useAdminList<AdminUser>("/api/admin/users", userPage, { q: userSearch || undefined });
  const { data: reportsPage, isLoading: reportsLoading } = useAdminList<AdminReport>("/api/admin/reports", reportPage, {
    status: reportFilter === "all" ? undefined : reportFilter,
  });
  const users = usersPage?.rows;
  const reports = reportsPage?.rows;

  const { data: adminGroups } = useQuery<any[]>({
    queryKey: ["/api/admin/groups"],
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: number; data: Partial<User> }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: t("common.success", "Success"), description: t("staff:admin_dashboard.user_update_success", "User updated.") });
    },
    onError: (error: Error) => {
      toast({ title: t("common.error", "An error occurred"), description: error.message, variant: "destructive" });
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
      toast({ title: t("common.success", "Success"), description: t("staff:admin_dashboard.user_deleted", "User permanently deleted.") });
    },
    onError: (error: Error) => {
      toast({ title: t("common.error", "An error occurred"), description: error.message, variant: "destructive" });
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
      toast({ title: t("common.success", "Success"), description: t("staff:admin_dashboard.report_update_success", "Report updated.") });
    },
  });

  // Search is done by the server (?q=); "verified"/"banned" filter the current page
  const filteredUsers = (users || [])
    .filter((u) => {
      switch (userFilter) {
        case "verified": return u.verified;
        case "banned": return !!u.isBanned;
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

  const isOwner = user?.role === "owner";

  const handleRoleChange = (userId: number, currentRole: string) => {
    const roles: ("user" | "admin" | "owner")[] = ["user", "admin", "owner"];
    const currentIndex = roles.indexOf(currentRole as any);
    const nextRole = roles[(currentIndex + 1) % roles.length];
    
    // Safety check for owner promotion already in backend, but good to have UI hint
    if (nextRole === "owner" && user?.role !== "owner") {
      toast({ title: t("staff:admin_dashboard.access_denied", "Access denied"), description: t("staff:admin_dashboard.owner_only_promote", "Only system owners can promote to Owner status."), variant: "destructive" });
      return;
    }

    updateUserMutation.mutate({ userId, data: { role: nextRole } });
  };

  // Account bans live in the bans table (karma is reputation only): ban = new account ban, unban = revoke the
  // user's active account bans. A new ban asks for the reason first (userToBan dialog). Both need the "users"
  // permission like this list (the bans registry under /api/admin/bans needs "security").
  const banMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: number; reason: string }) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/ban`, { reason });
      return res.json();
    },
    onSuccess: () => {
      setUserToBan(null);
      setBanReason("");
      invalidateBanState();
      toast({ title: t("common.success", "Success"), description: t("staff:admin_dashboard.user_update_success", "User updated.") });
    },
    onError: (error: Error) => {
      toast({ title: t("common.error", "An error occurred"), description: error.message, variant: "destructive" });
    },
  });

  const unbanMutation = useMutation({
    mutationFn: async (userId: number) => {
      await apiRequest("POST", `/api/admin/users/${userId}/unban`, {});
    },
    onSuccess: () => {
      invalidateBanState();
      toast({ title: t("common.success", "Success"), description: t("staff:admin_dashboard.user_update_success", "User updated.") });
    },
    onError: (error: Error) => {
      invalidateBanState();
      toast({ title: t("common.error", "An error occurred"), description: error.message, variant: "destructive" });
    },
  });

  const invalidateBanState = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/bans"] });
  };

  const handleBanToggle = (u: AdminUser) => {
    if (u.isBanned) unbanMutation.mutate(u.id);
    else {
      setBanReason("");
      setUserToBan(u);
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
    // An empty reason is left out (the server then uses its default); errors are shown, not swallowed
    const trimmedReason = reason?.trim() || undefined;
    try {
      if (bulkAction.type === "users") {
        await apiRequest("POST", "/api/admin/bulk/users", {
          user_ids: Array.from(selectedUsers),
          action: bulkAction.actionId,
          reason: trimmedReason,
          duration_hours: duration || undefined,
        });
        setSelectedUsers(new Set());
        queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      } else if (bulkAction.type === "reports") {
        await apiRequest("POST", "/api/admin/bulk/reports", {
          report_ids: Array.from(selectedReports),
          action: bulkAction.actionId,
          reason: trimmedReason,
        });
        setSelectedReports(new Set());
        queryClient.invalidateQueries({ queryKey: ["/api/admin/reports"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      }
      toast({ title: t("staff:admin_dashboard.bulk_success", "Bulk action executed successfully.") });
    } catch (error) {
      toast({ title: t("common.error", "An error occurred"), description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
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

  const currentTab = location === "/admin/reports" ? "reports" : 
                    location === "/admin/groups" ? "groups" : "users";

  return (
    <TooltipProvider>
        <div className="space-y-8 animate-in fade-in duration-700 pb-20">
          <PageHeader
            eyebrow={t("staff:admin.overview_eyebrow", "Admin / Overview")}
            title={t("staff:admin.command_center", "Command Center")}
            description={t("staff:admin_dashboard.description", "Monitor platform health and manage operations in zero-gravity.")}
          />

          {/* Statistics Grid */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            {statsLoading ? [...Array(5)].map((_, i) => <StatCardSkeleton key={i} />) : (
              <>
                <MetricCard title={t("staff:admin.stats.total_users", "Total Users")} value={stats?.totalUsers || 0} icon={Users} description={t("staff:admin_dashboard.stats.total_users_desc", "Cumulative registered users across the platform.")} />
                <MetricCard title={t("staff:admin.stats.total_reports", "Total Reports")} value={stats?.totalReports || 0} icon={Flag} description={t("staff:admin_dashboard.stats.total_reports_desc", "Total report flags received across all content.")} />
                <MetricCard 
                  title={t("staff:admin.stats.pending_reports", "Pending Reports")} 
                  value={stats?.pendingReports || 0} 
                  icon={AlertTriangle} 
                  priority={stats?.pendingReports && stats.pendingReports > 0 ? "critical" : "success"}
                  description={t("staff:admin_dashboard.stats.pending_reports_desc", "Awaiting manual review by the administration.")} 
                />
                <MetricCard title={t("staff:admin.stats.active_users", "Active Users")} value={stats?.activeUsers || 0} icon={Activity} trend={12} description={t("staff:admin_dashboard.stats.active_users_desc", "Unique users active within the last 24 hours.")} />
                <MetricCard title={t("staff:admin.stats.verified_users", "Verified Users")} value={stats?.verifiedUsers || 0} icon={UserCheck} description={t("staff:admin_dashboard.stats.verified_users_desc", "Trusted members who completed verification.")} />
              </>
            )}
          </div>

          <Tabs
            value={currentTab}
            className="space-y-6"
            onValueChange={(value) => {
              setLocation(`/admin/${value}`);
              queryClient.invalidateQueries({ queryKey: [`/api/admin/${value}`] });
            }}
          >
            <div className="ov-rule flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4">
              <TabsList className="max-w-full justify-start overflow-x-auto">
                {hasPermission("users") && (
                  <TabsTrigger value="users" className="gap-2 px-4">
                    <Users className="h-4 w-4" />
                    {t("staff:admin.tabs.users", "Users")}
                    <span className={cn("ov-data ml-1 text-xs", currentTab === "users" ? "text-primary" : "text-muted-foreground")}>
                      {usersPage?.total ?? 0}
                    </span>
                  </TabsTrigger>
                )}
                {hasPermission("reports") && (
                  <TabsTrigger value="reports" className="gap-2 px-4">
                    <Flag className="h-4 w-4" />
                    {t("staff:admin.tabs.reports", "Reports")}
                    {stats?.pendingReports && stats.pendingReports > 0 ? (
                      <span className="ov-chip ov-chip-star ov-data ml-1 h-5 px-1.5 text-xs">
                        {stats.pendingReports}
                      </span>
                    ) : (
                      <span className={cn("ov-data ml-1 text-xs", currentTab === "reports" ? "text-primary" : "text-muted-foreground")}>
                        {reportsPage?.total ?? 0}
                      </span>
                    )}
                  </TabsTrigger>
                )}
                {hasPermission("groups") && (
                  <TabsTrigger value="groups" className="gap-2 px-4">
                    <Shield className="h-4 w-4" />
                    {t("staff:admin_dashboard.tabs.groups", "Groups")}
                  </TabsTrigger>
                )}
              </TabsList>

              <div className="flex items-center gap-4 w-full lg:w-auto">
                <div className="relative flex-1 lg:w-80 group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    placeholder={t("staff:admin_dashboard.search_placeholder", "Search the Verse…")}
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <TabsContent value="users">
              <Card className="overflow-hidden isolate">
                <CardHeader className="ov-rule px-6 py-4 flex flex-row flex-wrap items-center justify-between gap-4 space-y-0 sticky top-0 z-20">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{t("staff:admin_dashboard.users.title", "User Directory")}</CardTitle>
                    <CardDescription className="text-xs">{t("staff:admin_dashboard.users.description", "Manage authentication states and moderation levels.")}</CardDescription>
                  </div>
                  <div className="flex gap-0.5 rounded-sm border border-border bg-background/40 p-1">
                    <Button variant="ghost" size="sm" className={cn("h-7 px-3 text-xs", userFilter === "all" && "ov-tab-active")} onClick={() => setUserFilter("all")}>{t("staff:admin_dashboard.users.filter_all", "All")}</Button>
                    <Button variant="ghost" size="sm" className={cn("h-7 px-3 text-xs", userFilter === "verified" && "ov-tab-active")} onClick={() => setUserFilter("verified")}>{t("staff:admin_dashboard.users.filter_verified", "Verified")}</Button>
                    <Button variant="ghost" size="sm" className={cn("h-7 px-3 text-xs", userFilter === "banned" && "ov-tab-active")} onClick={() => setUserFilter("banned")}>{t("staff:admin_dashboard.users.filter_banned", "Banned")}</Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <ResponsiveTable<AdminUser>
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
                        label: t("staff:admin_dashboard.users.col_user", "User"), 
                        render: (u) => (
                          <div className="flex items-center gap-3 py-1">
                            <UserAvatar user={{ username: u.username }} size="sm" />
                            <div className="flex flex-col min-w-0">
                              <Link href={`/users/${u.username}`} className="hover:text-primary transition-colors text-sm font-semibold truncate leading-tight">{u.username}</Link>
                              <span className="ov-data text-xs text-muted-foreground">{t("staff:admin_dashboard.users.id", { id: u.id, defaultValue: "ID: {{id}}" })}</span>
                            </div>
                          </div>
                        )
                      },
                      { key: "email", label: t("staff:admin_dashboard.users.col_contact", "Contact"), render: (u) => <span className="ov-data text-xs">{u.email}</span> },
                      {
                        key: "role",
                        label: t("staff:admin_dashboard.users.col_role", "Role"),
                        render: (u) => (
                          <span className={cn("ov-chip capitalize", u.role === "owner" ? "ov-chip-star" : u.role === "admin" ? "ov-chip-primary" : "")}>
                            {t(`admin.roles.${u.role}`, u.role)}
                          </span>
                        )
                      },
                      {
                        key: "karma",
                        label: t("staff:admin_dashboard.users.col_rep", "Rep"),
                        render: (u) => (
                          <div className={cn("ov-chip ov-data",
                            u.karma >= 0 ? "ov-chip-success" : "ov-chip-danger")}>
                            {u.karma >= 0 ? "+" : ""}{u.karma}
                          </div>
                        )
                      },
                      { 
                        key: "actions", 
                        label: t("staff:admin_dashboard.users.col_operations", "Operations"), 
                        render: (u) => (
                          <div className="flex items-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/10 hover:text-primary" onClick={() => handleVerificationToggle(u.id, !!u.verified)}>
                                  <BadgeCheck className={cn("h-4 w-4", u.verified ? "text-star fill-star/20" : "opacity-30")} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{u.verified ? t("staff:admin_dashboard.users.revoke_verification", "Revoke verification") : t("staff:admin.users_table.verify_user", "Verify User")}</TooltipContent>
                            </Tooltip>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56 p-2">
                                {/* Roles are granted by owners only (the server answers 403 to admins) */}
                                {isOwner && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <DropdownMenuItem className="gap-3 py-2.5 cursor-pointer" onSelect={(e) => e.preventDefault()}>
                                      <Shield className="h-4 w-4 text-primary" />
                                      <div className="flex flex-col flex-1">
                                        <span className="text-sm font-medium">{t("staff:admin_dashboard.users.assign_role", "Assign role")}</span>
                                        <span className="text-xs text-muted-foreground">{t("staff:admin_dashboard.users.currently", "Currently:")} <span className="capitalize">{t(`admin.roles.${u.role}`, u.role)}</span></span>
                                      </div>
                                      <ArrowRight className="h-3 w-3 opacity-30" />
                                    </DropdownMenuItem>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent side="right" className="p-2">
                                    <DropdownMenuItem className="gap-2 py-2 text-sm font-medium" onClick={() => updateUserMutation.mutate({ userId: u.id, data: { role: "user" } })}>
                                      <Users className="h-3 w-3" /> {t("admin.roles.user", "User")}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="gap-2 py-2 text-sm font-medium" onClick={() => updateUserMutation.mutate({ userId: u.id, data: { role: "admin" } })}>
                                      <Shield className="h-3 w-3 text-primary" /> {t("admin.roles.admin", "Admin")}
                                    </DropdownMenuItem>
                                    {user?.role === "owner" && (
                                      <DropdownMenuItem className="gap-2 py-2 text-sm font-medium text-primary" onClick={() => updateUserMutation.mutate({ userId: u.id, data: { role: "owner" } })}>
                                        <Crown className="h-3 w-3" /> {t("admin.roles.owner", "Owner")}
                                      </DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                                )}

                                {hasPermission("groups") && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <DropdownMenuItem className="gap-3 py-2.5 cursor-pointer" onSelect={(e) => e.preventDefault()}>
                                        <Shield className="h-4 w-4 text-primary" />
                                        <div className="flex flex-col flex-1">
                                          <span className="text-sm font-medium">{t("staff:admin_dashboard.users.assign_group", "Assign group")}</span>
                                          <span className="text-xs text-muted-foreground">
                                            {adminGroups?.find(g => g.id === u.adminGroupId)?.name || t("staff:admin_dashboard.users.no_group", "No group")}
                                          </span>
                                        </div>
                                        <ArrowRight className="h-3 w-3 opacity-30" />
                                      </DropdownMenuItem>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent side="right" className="w-48 p-2">
                                      <DropdownMenuItem className="gap-2 py-2 text-sm font-medium" onClick={() => updateUserMutation.mutate({ userId: u.id, data: { adminGroupId: null } })}>
                                        <X className="h-3 w-3" /> {t("staff:admin_dashboard.users.group_none", "None")}
                                      </DropdownMenuItem>
                                      {adminGroups?.map(group => (
                                        <DropdownMenuItem
                                          key={group.id}
                                          className="gap-2 py-2 text-sm font-medium"
                                          onClick={() => updateUserMutation.mutate({ userId: u.id, data: { adminGroupId: group.id } })}
                                        >
                                          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: group.color }} />
                                          {group.name}
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}

                                <DropdownMenuItem className="gap-3 py-2.5 cursor-pointer" onClick={() => handleShadowBanToggle(u)}>
                                  <UserX className={cn("h-4 w-4", u.isShadowBanned ? "text-star" : "text-muted-foreground")} />
                                  <div className="flex flex-col">
                                    <span className="text-sm font-medium">
                                      {u.isShadowBanned ? t("staff:admin_dashboard.users.revoke_shadowban", "Revoke shadowban") : t("staff:admin_dashboard.users.shadowban_user", "Shadowban user")}
                                    </span>
                                    <span className="text-xs text-muted-foreground">{t("staff:admin_dashboard.users.shadowban_desc", "Silent moderation state")}</span>
                                  </div>
                                </DropdownMenuItem>

                                <DropdownMenuItem className="gap-3 py-2.5 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10" onClick={() => handleBanToggle(u)}>
                                  <Ban className="h-4 w-4" />
                                  <div className="flex flex-col">
                                    <span className="text-sm font-medium">
                                      {u.isBanned ? t("staff:admin_dashboard.users.lift_restriction", "Lift restriction") : t("staff:admin_dashboard.users.restrict_account", "Restrict account")}
                                    </span>
                                    <span className="text-xs opacity-70">{u.isBanned ? t("staff:admin_dashboard.users.restore_access", "Restore access") : t("staff:admin_dashboard.users.restrict_desc", "Zero-gravity suspension")}</span>
                                  </div>
                                </DropdownMenuItem>

                                <div className="my-2 h-px bg-border" />

                                <DropdownMenuItem className="gap-3 py-2.5 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10" onClick={() => setUserToDelete(u)}>
                                  <Trash2 className="h-4 w-4" />
                                  <span className="text-sm font-semibold">{t("staff:admin_dashboard.users.purge_entity", "Purge entity")}</span>
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
                              <p className="font-semibold text-sm">{u.username}</p>
                              <p className="ov-data text-xs text-muted-foreground">{u.email}</p>
                            </div>
                          </div>
                          <Checkbox
                            checked={selectedUsers.has(u.id)}
                            onCheckedChange={() => toggleUserSelection(u.id)}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex gap-2">
                             <span className={cn("ov-chip capitalize", u.role === "owner" ? "ov-chip-star" : u.role === "admin" ? "ov-chip-primary" : "")}>{t(`admin.roles.${u.role}`, u.role)}</span>
                             <div className={cn("ov-chip ov-data", u.karma >= 0 ? "ov-chip-success" : "ov-chip-danger")}>
                               {u.karma >= 0 ? "+" : ""}{u.karma}
                             </div>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={() => handleVerificationToggle(u.id, !!u.verified)}>
                              {u.verified ? t("staff:admin_dashboard.users.verified", "Verified") : t("staff:admin_dashboard.users.verify", "Verify")}
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56 p-2">
                                {/* Roles are granted by owners only (the server answers 403 to admins) */}
                                {isOwner && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <DropdownMenuItem className="gap-3 py-2.5 cursor-pointer" onSelect={(e) => e.preventDefault()}>
                                      <Shield className="h-4 w-4 text-primary" />
                                      <span className="text-sm font-medium flex-1">{t("staff:admin_dashboard.users.assign_role", "Assign role")}</span>
                                      <ArrowRight className="h-3 w-3 opacity-30" />
                                    </DropdownMenuItem>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent side="right" className="p-2">
                                    <DropdownMenuItem className="gap-2 py-2 text-sm font-medium" onClick={() => updateUserMutation.mutate({ userId: u.id, data: { role: "user" } })}>
                                      <Users className="h-3 w-3" /> {t("admin.roles.user", "User")}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="gap-2 py-2 text-sm font-medium" onClick={() => updateUserMutation.mutate({ userId: u.id, data: { role: "admin" } })}>
                                      <Shield className="h-3 w-3 text-primary" /> {t("admin.roles.admin", "Admin")}
                                    </DropdownMenuItem>
                                    {user?.role === "owner" && (
                                      <DropdownMenuItem className="gap-2 py-2 text-sm font-medium text-primary" onClick={() => updateUserMutation.mutate({ userId: u.id, data: { role: "owner" } })}>
                                        <Crown className="h-3 w-3" /> {t("admin.roles.owner", "Owner")}
                                      </DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                                )}
                                <DropdownMenuItem className="gap-3 py-2.5 cursor-pointer" onClick={() => handleShadowBanToggle(u)}>
                                  <UserX className={cn("h-4 w-4", u.isShadowBanned ? "text-star" : "text-muted-foreground")} />
                                  <span className="text-sm font-medium">{t("staff:admin_dashboard.users.toggle_shadowban", "Toggle shadowban")}</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem className="gap-3 py-2.5 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10" onClick={() => handleBanToggle(u)}>
                                  <Ban className="h-4 w-4" />
                                  <span className="text-sm font-medium">{t("staff:admin_dashboard.users.toggle_restriction", "Toggle restriction")}</span>
                                </DropdownMenuItem>
                                <div className="my-2 h-px bg-border" />
                                <DropdownMenuItem className="gap-3 py-2.5 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10" onClick={() => setUserToDelete(u)}>
                                  <Trash2 className="h-4 w-4" />
                                  <span className="text-sm font-semibold">{t("staff:admin_dashboard.users.purge_account", "Purge account")}</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    )}
                  />
                </CardContent>
                <ListPager page={userPage} pageSize={ADMIN_PAGE_SIZE} total={usersPage?.total ?? 0} onPageChange={setUserPage} />
              </Card>
            </TabsContent>

            <TabsContent value="reports">
               <Card className="overflow-hidden isolate">
                <CardHeader className="ov-rule px-6 py-4 flex flex-row flex-wrap items-center justify-between gap-4 space-y-0 sticky top-0 z-20">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{t("staff:admin_dashboard.reports.title", "Content Integrity Queue")}</CardTitle>
                    <CardDescription className="text-xs">{t("staff:admin_dashboard.reports.description", "Community flags requiring administrative adjudication.")}</CardDescription>
                  </div>
                  <div className="flex gap-0.5 rounded-sm border border-border bg-background/40 p-1">
                    <Button variant="ghost" size="sm" className={cn("h-7 px-3 text-xs", reportFilter === "pending" && "ov-tab-active")} onClick={() => setReportFilter("pending")}>{t("staff:admin.reports_table.status_pending", "Pending")}</Button>
                    <Button variant="ghost" size="sm" className={cn("h-7 px-3 text-xs", reportFilter === "resolved" && "ov-tab-active")} onClick={() => setReportFilter("resolved")}>{t("staff:admin.reports_table.status_resolved", "Resolved")}</Button>
                    <Button variant="ghost" size="sm" className={cn("h-7 px-3 text-xs", reportFilter === "rejected" && "ov-tab-active")} onClick={() => setReportFilter("rejected")}>{t("staff:admin.reports_table.status_rejected", "Rejected")}</Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <ResponsiveTable<AdminReport>
                    keyField="id"
                    columns={[
                      { 
                        key: "source", 
                        label: t("staff:admin_dashboard.reports.col_source", "Source"), 
                        render: (r) => (
                          <div className="flex flex-col">
                            <span className="text-xs font-semibold">{(r as any).reporter?.username}</span>
                            <span className="ov-data text-xs text-muted-foreground">{r.ipAddress || t("staff:admin_dashboard.reports.internal", "INTERNAL")}</span>
                          </div>
                        )
                      },
                      {
                        key: "entity",
                        label: t("staff:admin_dashboard.reports.col_entity", "Entity"),
                        render: (r) => (
                          <span className="ov-chip capitalize">
                            {(r as any).content?.type && t(`admin.reports_table.type_${(r as any).content.type}`, (r as any).content.type)}
                          </span>
                        )
                      },
                      {
                        key: "observation",
                        label: t("staff:admin_dashboard.reports.col_observation", "Observation"),
                        render: (r) => (
                          <p className="text-xs font-medium truncate max-w-[200px]">{(r as any).content?.title || (r as any).content?.content}</p>
                        )
                      },
                      {
                        key: "status",
                        label: t("staff:admin.reports_table.status", "Status"),
                        render: (r) => (
                          <span className={cn("ov-chip capitalize", r.status === "resolved" ? "ov-chip-success" : r.status === "rejected" ? "ov-chip-danger" : "ov-chip-star")}>
                            {t(`admin.reports_table.status_${r.status}`, r.status)}
                          </span>
                        )
                      },
                      { 
                        key: "actions", 
                        label: t("staff:admin_dashboard.reports.col_decisions", "Decisions"), 
                        render: (r) => (
                          <div className="flex items-center gap-2 relative z-50">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-8 w-8 p-0 text-primary hover:text-primary hover:bg-primary/10 relative z-[60]"
                              disabled={updateReportMutation.isPending || r.status !== "pending"} 
                              onClick={(e) => { 
                                e.preventDefault();
                                e.stopPropagation(); 
                                console.log("[Admin] Resolve clicked for report:", r.id);
                                updateReportMutation.mutate({ reportId: r.id, status: "resolved" }); 
                              }}
                            >
                              <CheckCircle2 className="h-5 w-5" />
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 relative z-[60]"
                              disabled={updateReportMutation.isPending || r.status !== "pending"} 
                              onClick={(e) => { 
                                e.preventDefault();
                                e.stopPropagation(); 
                                console.log("[Admin] Reject clicked for report:", r.id);
                                updateReportMutation.mutate({ reportId: r.id, status: "rejected" }); 
                              }}
                            >
                              <XCircle className="h-5 w-5" />
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
                            <span className="text-sm font-semibold">{(r as any).reporter?.username}</span>
                            <span className="ov-label">{t("staff:admin_dashboard.reports.type_flag", { type: (r as any).content?.type ? t(`admin.reports_table.type_${(r as any).content.type}`, (r as any).content.type) : "", defaultValue: "{{type}} flag" })}</span>
                          </div>
                          <span className={cn("ov-chip capitalize", r.status === "resolved" ? "ov-chip-success" : r.status === "rejected" ? "ov-chip-danger" : "ov-chip-star")}>
                            {t(`admin.reports_table.status_${r.status}`, r.status)}
                          </span>
                        </div>
                        <p className="text-xs italic text-muted-foreground line-clamp-2">"{r.reason}"</p>
                        <div className="flex items-center justify-between pt-2 border-t border-border">
                          <span className="ov-data text-xs text-muted-foreground">{format(new Date(r.createdAt), "PP, HH:mm", { locale: dateLocale })}</span>
                          <div className="flex gap-2">
                             <Button variant="outline" size="sm" className="h-8 px-3 text-xs text-primary" disabled={r.status !== "pending"} onClick={(e) => { e.stopPropagation(); updateReportMutation.mutate({ reportId: r.id, status: "resolved" }); }}>
                               {t("staff:admin.reports_table.resolve", "Resolve")}
                             </Button>
                             <Button variant="outline" size="sm" className="h-8 px-3 text-xs text-destructive" disabled={r.status !== "pending"} onClick={(e) => { e.stopPropagation(); updateReportMutation.mutate({ reportId: r.id, status: "rejected" }); }}>
                               {t("staff:admin_dashboard.reports.dismiss", "Dismiss")}
                             </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  />
                </CardContent>
                <ListPager page={reportPage} pageSize={ADMIN_PAGE_SIZE} total={reportsPage?.total ?? 0} onPageChange={setReportPage} />
              </Card>
            </TabsContent>

            <TabsContent value="groups">
              <GroupsManagement />
            </TabsContent>
          </Tabs>

          <BulkActionToolbar 
            type={currentTab} 
            count={currentTab === "users" ? selectedUsers.size : selectedReports.size} 
            onAction={(actionId) => setBulkAction({ type: currentTab, actionId })}
            onClear={() => currentTab === "users" ? setSelectedUsers(new Set()) : setSelectedReports(new Set())}
          />

          <AlertDialog open={userToBan !== null} onOpenChange={(open) => { if (!open) setUserToBan(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("staff:admin_dashboard.users.ban_confirm_title", { username: userToBan?.username ?? "", defaultValue: "Restrict {{username}}?" })}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("staff:admin_dashboard.users.ban_confirm_desc", "The account is banned until an administrator lifts the restriction.")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-2">
                <Label htmlFor="ban-reason">{t("server:fields.reason")}</Label>
                <Textarea id="ban-reason" value={banReason} maxLength={500} onChange={(e) => setBanReason(e.target.value)} />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={!banReason.trim() || banMutation.isPending}
                  onClick={(e) => {
                    // Keep the dialog open until the ban is saved (closed in onSuccess)
                    e.preventDefault();
                    if (userToBan && banReason.trim()) banMutation.mutate({ userId: userToBan.id, reason: banReason.trim() });
                  }}
                >
                  {t("staff:admin_dashboard.users.restrict_account", "Restrict account")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog open={userToDelete !== null} onOpenChange={(open) => { if (!open) setUserToDelete(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("staff:admin_dashboard.users.delete_confirm_title", "Delete this account permanently?")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("staff:admin_dashboard.users.delete_confirm_desc", {
                    username: userToDelete?.username ?? "",
                    defaultValue: "The account of {{username}} will be deleted permanently. This cannot be undone.",
                  })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={deleteUserMutation.isPending}
                  onClick={() => {
                    if (userToDelete) deleteUserMutation.mutate(userToDelete.id);
                    setUserToDelete(null);
                  }}
                >
                  {t("common.delete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

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
