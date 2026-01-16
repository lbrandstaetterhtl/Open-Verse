import { Navbar } from "@/components/layout/navbar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { format } from "date-fns";
import { User, Report } from "@shared/schema";
import {
  Loader2, Shield, Users, Flag, CheckCircle, XCircle, Search,
  Ban, Check, AlertTriangle, Trophy, BadgeCheck, Activity,
  TrendingUp, UserCheck, UserX, MessagesSquare, Trash2, ShieldOff
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Skeleton } from "@/components/ui/skeleton";

// Extended Report type to include additional fields
interface ExtendedReport extends Report {
  reporter?: {
    username: string;
  };
  content?: {
    type: 'post' | 'discussion' | 'comment';
    title?: string;
    content?: string;
    author?: {
      username: string;
      id: number;
    };
  };
}

interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  verifiedUsers: number;
  bannedUsers: number;
  deletedUsers: number;
  totalPosts: number;
  totalReports: number;
  pendingReports: number;
  resolvedReports: number;
  rejectedReports: number;
}

// Add new component for stats card skeleton
const StatCardSkeleton = () => (
  <Card>
    <CardHeader className="space-y-2">
      <div className="h-4 w-1/2">
        <Skeleton className="h-full w-full" />
      </div>
      <div className="h-8 w-3/4">
        <Skeleton className="h-full w-full" />
      </div>
    </CardHeader>
  </Card>
);

// Add new component for user row skeleton
const UserRowSkeleton = () => (
  <TableRow>
    <TableCell>
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-4 w-24" />
      </div>
    </TableCell>
    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
    <TableCell><Skeleton className="h-6 w-24" /></TableCell>
    <TableCell><Skeleton className="h-6 w-16" /></TableCell>
    <TableCell><Skeleton className="h-6 w-24" /></TableCell>
    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
    <TableCell>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
      </div>
    </TableCell>
  </TableRow>
);

// Add new component for report row skeleton
const ReportRowSkeleton = () => (
  <TableRow>
    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
    <TableCell>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-8 w-8" />
      </div>
    </TableCell>
  </TableRow>
);

import { useTranslation } from "react-i18next";
// ... imports

export default function AdminDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [userFilter, setUserFilter] = useState<"all" | "verified" | "banned">("all");
  const [reportFilter, setReportFilter] = useState<"all" | "pending" | "resolved" | "rejected">("all");

  if (!user || !user.isAdmin) {
    return <Redirect to="/" />;
  }

  // Fetch dashboard statistics
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/admin/stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
  });

  const { data: reports, isLoading: reportsLoading } = useQuery<ExtendedReport[]>({
    queryKey: ["/api/admin/reports"],
    queryFn: async () => {
      const res = await fetch("/api/admin/reports");
      if (!res.ok) throw new Error("Failed to fetch reports");
      return res.json();
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}`, data);
      if (!res.ok) {
        throw new Error("Failed to update user");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "User updated successfully",
      });
      // Invalidate queries to refresh users and stats
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetRolesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/reset-roles");
      if (!res.ok) {
        throw new Error("Failed to reset roles");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "Success",
        description: "All roles have been reset successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateReportMutation = useMutation({
    mutationFn: async ({ reportId, status }: { reportId: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/reports/${reportId}`, { status });
      if (!res.ok) {
        throw new Error("Failed to update report status");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({
        title: "Success",
        description: "Report status updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("DELETE", `/api/admin/users/${userId}`);
      if (!res.ok) {
        throw new Error("Failed to delete user");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "User deleted successfully",
      });
      // Invalidate queries to refresh users and stats
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const filteredUsers = users?.filter(user => {
    const matchesSearch = user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.email || "").toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    switch (userFilter) {
      case "verified":
        return user.verified;
      case "banned":
        return user.karma < 0;
      default:
        return true;
    }
  });

  const filteredReports = reports?.filter(report => {
    if (reportFilter === "pending") return report.status === "pending";
    if (reportFilter === "resolved") return report.status === "resolved";
    if (reportFilter === "rejected") return report.status === "rejected";
    return true;
  });

  const handleVerificationToggle = async (userId: number, currentVerified: boolean) => {
    // Confirmation is now handled by AlertDialog in the UI
    try {
      console.log('Toggling verification:', { userId, currentVerified, newValue: !currentVerified });

      await updateUserMutation.mutateAsync({
        userId,
        data: {
          verified: !currentVerified,
          // Include role and isAdmin to prevent accidental role changes
          role: users?.find(u => u.id === userId)?.role,
          isAdmin: users?.find(u => u.id === userId)?.isAdmin
        }
      });

      // Force refetch all user data
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/users"] });

      toast({
        title: "Success",
        description: `User ${!currentVerified ? 'verified' : 'unverified'} successfully`,
      });
    } catch (error) {
      console.error('Error toggling verification:', error);
      toast({
        title: "Error",
        description: "Failed to update user verification status",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <Navbar />
      <main className="w-full px-6 pt-24 pb-8">
        <div className="w-full mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <Shield className="h-8 w-8 text-primary" />
              <h1 className="text-4xl font-bold">{t('admin.title')}</h1>
            </div>
            {user.role === 'owner' && (
              <Button
                variant="outline"
                onClick={() => {
                  if (window.confirm('Are you sure you want to reset all roles?')) {
                    resetRolesMutation.mutate();
                  }
                }}
                disabled={resetRolesMutation.isPending}
              >
                {t('admin.reset_roles')}
              </Button>
            )}
          </div>

          {/* Statistics Cards */}
          {statsLoading ? (
            <div className="grid gap-4 md:grid-cols-4 mb-8">
              {[...Array(8)].map((_, i) => (
                <StatCardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-4 mb-8">
              <Card>
                <CardHeader>
                  <CardDescription className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    {t('admin.stats.total_users')}
                  </CardDescription>
                  <CardTitle>{stats?.totalUsers || 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription className="flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    {t('admin.stats.active_users')}
                  </CardDescription>
                  <CardTitle>{stats?.activeUsers || 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4" />
                    {t('admin.stats.verified_users')}
                  </CardDescription>
                  <CardTitle>{stats?.verifiedUsers || 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription className="flex items-center gap-2">
                    <UserX className="h-4 w-4" />
                    {t('admin.stats.banned_users')}
                  </CardDescription>
                  <CardTitle>{stats?.bannedUsers || 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription className="flex items-center gap-2">
                    <Trash2 className="h-4 w-4" />
                    {t('admin.stats.deleted_users')}
                  </CardDescription>
                  <CardTitle>{stats?.deletedUsers || 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription className="flex items-center gap-2">
                    <MessagesSquare className="h-4 w-4" />
                    {t('admin.stats.total_posts')}
                  </CardDescription>
                  <CardTitle>{stats?.totalPosts || 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription className="flex items-center gap-2">
                    <Flag className="h-4 w-4" />
                    {t('admin.stats.total_reports')}
                  </CardDescription>
                  <CardTitle>{stats?.totalReports || 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    {t('admin.stats.pending_reports')}
                  </CardDescription>
                  <CardTitle>{stats?.pendingReports || 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    {t('admin.stats.resolved_reports')}
                  </CardDescription>
                  <CardTitle>{stats?.resolvedReports || 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription className="flex items-center gap-2">
                    <XCircle className="h-4 w-4" />
                    {t('admin.stats.rejected_reports')}
                  </CardDescription>
                  <CardTitle>{stats?.rejectedReports || 0}</CardTitle>
                </CardHeader>
              </Card>
            </div>
          )}

          <Tabs defaultValue="users" className="space-y-4" onValueChange={(value) => {
            // Refresh data when switching tabs
            if (value === 'users') {
              queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
            } else if (value === 'reports') {
              queryClient.invalidateQueries({ queryKey: ['/api/admin/reports'] });
            }
          }}>
            <TabsList>
              <TabsTrigger value="users" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                {t('admin.tabs.users')}
              </TabsTrigger>
              <TabsTrigger value="reports" className="flex items-center gap-2">
                <Flag className="h-4 w-4" />
                {t('admin.tabs.reports')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="users">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle>User Management</CardTitle>
                  <div className="flex items-center space-x-2">
                    <div className="flex gap-2">
                      <Button
                        variant={userFilter === "all" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setUserFilter("all")}
                      >
                        {t('feed.all')}
                      </Button>
                      <Button
                        variant={userFilter === "verified" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setUserFilter("verified")}
                      >
                        {t('admin.stats.verified_users')}
                      </Button>
                      <Button
                        variant={userFilter === "banned" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setUserFilter("banned")}
                      >
                        {t('admin.stats.banned_users')}
                      </Button>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search users..."
                        className="pl-8"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {usersLoading ? (
                    <div className="relative overflow-hidden rounded-b-lg">
                      <div className="overflow-auto h-[600px]">
                        <Table>
                          <TableHeader className="sticky top-0 bg-card z-20 border-b">
                            <TableRow>
                              <TableHead className="w-[200px]">Username</TableHead>
                              <TableHead className="w-[200px]">Email</TableHead>
                              <TableHead className="w-[200px]">Status</TableHead>
                              <TableHead className="w-[100px]">Role</TableHead>
                              <TableHead className="w-[150px]">Karma</TableHead>
                              <TableHead className="w-[200px]">Joined</TableHead>
                              <TableHead className="sticky right-0 bg-card w-[400px] z-20">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {[...Array(10)].map((_, i) => (
                              <UserRowSkeleton key={i} />
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ) : (
                    <div className="relative overflow-hidden rounded-b-lg">
                      <div className="overflow-auto h-[600px]">
                        <Table>
                          <TableHeader className="sticky top-0 bg-card z-20 border-b">
                            <TableRow>
                              <TableHead className="w-[200px]">Username</TableHead>
                              <TableHead className="w-[200px]">Email</TableHead>
                              <TableHead className="w-[200px]">Status</TableHead>
                              <TableHead className="w-[100px]">Role</TableHead>
                              <TableHead className="w-[150px]">Karma</TableHead>
                              <TableHead className="w-[200px]">Joined</TableHead>
                              <TableHead className="sticky right-0 bg-card w-[400px] z-20">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredUsers?.map((u) => (
                              <TableRow key={u.id}>
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-2">
                                    <UserAvatar
                                      user={{
                                        username: u.username
                                      }}
                                      size="sm"
                                    />
                                    <div className="flex items-center gap-1">
                                      <Link href={`/users/${u.username}`} className="hover:underline text-sm">
                                        {u.username}
                                      </Link>
                                      {u.verified && (
                                        <BadgeCheck className="h-4 w-4 text-blue-500 flex-shrink-0" />
                                      )}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>{u.email}</TableCell>
                                <TableCell>
                                  <div className="flex gap-2">
                                    <Badge variant={u.emailVerified ? "default" : "secondary"} className="whitespace-nowrap">
                                      {u.emailVerified ? t('admin.users_table.verify_email') : t('admin.users_table.unverify_email')}
                                    </Badge>
                                    {u.verified && (
                                      <Badge variant="default" className="bg-blue-500 flex items-center gap-1">
                                        <BadgeCheck className="h-4 w-4 text-white flex-shrink-0" />
                                        <span className="text-sm">{t('admin.stats.verified_users')}</span>
                                      </Badge>
                                    )}
                                    {u.karma < 0 && (
                                      <Badge variant="destructive" className="ml-2">
                                        {t('admin.users_table.ban_user')}
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant={
                                    u.role === 'owner' ? "destructive" :
                                      u.role === 'admin' ? "default" :
                                        "secondary"
                                  }>
                                    {t(`admin.roles.${u.role}`)}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge variant={u.karma >= 0 ? "default" : "destructive"} className="flex items-center gap-1 whitespace-nowrap">
                                    <Trophy className="h-3 w-3" />
                                    {u.karma} {t('admin.users_table.karma')}
                                  </Badge>
                                </TableCell>
                                <TableCell className="whitespace-nowrap">
                                  {format(new Date(u.createdAt), "PPp")}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center space-x-2">
                                    {(user.role === 'owner' || (user.role === 'admin' && u.role === 'user')) && (
                                      <>
                                        <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                            <Button
                                              size="sm"
                                              variant={u.verified ? "default" : "outline"}
                                              disabled={updateUserMutation.isPending}
                                              className="flex items-center gap-1"
                                            >
                                              <BadgeCheck className="h-4 w-4 flex-shrink-0" />
                                              {u.verified ? t('admin.users_table.unverify_user') : t('admin.users_table.verify_user')}
                                            </Button>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent>
                                            <AlertDialogHeader>
                                              <AlertDialogTitle>
                                                {u.verified ? t('admin.users_table.unverify_user') : t('admin.users_table.verify_user')}
                                              </AlertDialogTitle>
                                              <AlertDialogDescription>
                                                {u.verified
                                                  ? t('admin.users_table.unverify_user_confirm', { username: u.username })
                                                  : t('admin.users_table.verify_user_confirm', { username: u.username })}
                                              </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                              <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
                                              <AlertDialogAction
                                                onClick={() => handleVerificationToggle(u.id, u.verified)}
                                              >
                                                {u.verified ? t('admin.users_table.unverify_user') : t('admin.users_table.verify_user')}
                                              </AlertDialogAction>
                                            </AlertDialogFooter>
                                          </AlertDialogContent>
                                        </AlertDialog>
                                        <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                            <Button
                                              size="sm"
                                              variant={u.karma < 0 ? "default" : "destructive"}
                                              disabled={updateUserMutation.isPending}
                                            >
                                              {u.karma < 0 ? (
                                                <>
                                                  <Check className="h-4 w-4 mr-1" />
                                                  {t('admin.users_table.restore_user')}
                                                </>
                                              ) : (
                                                <>
                                                  <Ban className="h-4 w-4 mr-1" />
                                                  {t('admin.users_table.ban_user')}
                                                </>
                                              )}
                                            </Button>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent>
                                            <AlertDialogHeader>
                                              <AlertDialogTitle>
                                                {u.karma < 0 ? t('admin.users_table.restore_user') : t('admin.users_table.ban_user')}
                                              </AlertDialogTitle>
                                              <AlertDialogDescription>
                                                {u.karma < 0
                                                  ? t('admin.users_table.restore_user_confirm', { username: u.username })
                                                  : t('admin.users_table.ban_user_confirm', { username: u.username })}
                                              </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                                              <AlertDialogAction
                                                onClick={() => {
                                                  const newKarma = u.karma < 0 ? 5 : -100;
                                                  updateUserMutation.mutate({
                                                    userId: u.id,
                                                    data: { karma: newKarma }
                                                  });
                                                }}
                                                className={u.karma < 0 ? "" : "bg-destructive text-destructive-foreground hover:bg-destructive/90"}
                                              >
                                                {u.karma < 0 ? t('admin.users_table.restore_user') : t('admin.users_table.ban_user')}
                                              </AlertDialogAction>
                                            </AlertDialogFooter>
                                          </AlertDialogContent>
                                        </AlertDialog>
                                        <Button
                                          size="sm"
                                          variant={u.emailVerified ? "ghost" : "default"}
                                          onClick={() => updateUserMutation.mutate({
                                            userId: u.id,
                                            data: { emailVerified: !u.emailVerified }
                                          })}
                                          disabled={updateUserMutation.isPending}
                                        >
                                          {u.emailVerified ? (
                                            <>
                                              <AlertTriangle className="h-4 w-4 mr-1" />
                                              {t('admin.users_table.unverify_email')}
                                            </>
                                          ) : (
                                            <>
                                              <Check className="h-4 w-4 mr-1" />
                                              {t('admin.users_table.verify_email')}
                                            </>
                                          )}
                                        </Button>
                                        <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                            <Button
                                              size="sm"
                                              variant="destructive"
                                              disabled={deleteUserMutation.isPending}
                                            >
                                              <Trash2 className="h-4 w-4 mr-1" />
                                              {t('actions.delete')}
                                            </Button>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent>
                                            <AlertDialogHeader>
                                              <AlertDialogTitle>{t('actions.delete')}</AlertDialogTitle>
                                              <AlertDialogDescription>
                                                {t('admin.users_table.delete_user_confirm', { username: u.username })}
                                              </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                                              <AlertDialogAction
                                                onClick={() => deleteUserMutation.mutate(u.id)}
                                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                              >
                                                {t('actions.delete')}
                                              </AlertDialogAction>
                                            </AlertDialogFooter>
                                          </AlertDialogContent>
                                        </AlertDialog>
                                        {user.role === 'owner' && u.role !== 'admin' && u.role !== 'owner' && (
                                          <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                              <Button
                                                size="sm"
                                                variant="default"
                                                disabled={updateUserMutation.isPending}
                                              >
                                                <Shield className="h-4 w-4 mr-1" />
                                                {t('admin.users_table.make_admin')}
                                              </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                              <AlertDialogHeader>
                                                <AlertDialogTitle>{t('admin.users_table.make_admin')}</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                  {t('admin.users_table.make_admin_confirm', { username: u.username })}
                                                </AlertDialogDescription>
                                              </AlertDialogHeader>
                                              <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction
                                                  onClick={() => {
                                                    updateUserMutation.mutate({
                                                      userId: u.id,
                                                      data: {
                                                        role: 'admin',
                                                        isAdmin: true
                                                      }
                                                    });
                                                  }}
                                                >
                                                  {t('admin.users_table.make_admin')}
                                                </AlertDialogAction>
                                              </AlertDialogFooter>
                                            </AlertDialogContent>
                                          </AlertDialog>
                                        )}
                                        {user.role === 'owner' && u.role !== 'owner' && (
                                          <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                              <Button
                                                size="sm"
                                                variant="default"
                                                className="bg-purple-600 hover:bg-purple-700"
                                                disabled={updateUserMutation.isPending}
                                              >
                                                <Trophy className="h-4 w-4 mr-1" />
                                                {t('admin.users_table.make_owner')}
                                              </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                              <AlertDialogHeader>
                                                <AlertDialogTitle>{t('admin.users_table.make_owner')}</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                  {t('admin.users_table.make_owner_confirm', { username: u.username })}
                                                </AlertDialogDescription>
                                              </AlertDialogHeader>
                                              <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction
                                                  onClick={() => {
                                                    updateUserMutation.mutate({
                                                      userId: u.id,
                                                      data: {
                                                        role: 'owner',
                                                        isAdmin: true
                                                      }
                                                    });
                                                  }}
                                                >
                                                  {t('admin.users_table.make_owner')}
                                                </AlertDialogAction>
                                              </AlertDialogFooter>
                                            </AlertDialogContent>
                                          </AlertDialog>
                                        )}
                                        {user.role === 'owner' && u.role === 'owner' && u.id !== user.id && (
                                          <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                className="border-purple-600 text-purple-600 hover:bg-purple-50"
                                                disabled={updateUserMutation.isPending}
                                              >
                                                <ShieldOff className="h-4 w-4 mr-1" />
                                                {t('admin.users_table.remove_owner')}
                                              </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                              <AlertDialogHeader>
                                                <AlertDialogTitle>{t('admin.users_table.remove_owner')}</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                  {t('admin.users_table.remove_owner_confirm', { username: u.username })}
                                                </AlertDialogDescription>
                                              </AlertDialogHeader>
                                              <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction
                                                  onClick={() => {
                                                    updateUserMutation.mutate({
                                                      userId: u.id,
                                                      data: {
                                                        role: 'admin',
                                                        isAdmin: true
                                                      }
                                                    });
                                                  }}
                                                >
                                                  {t('admin.users_table.remove_owner')}
                                                </AlertDialogAction>
                                              </AlertDialogFooter>
                                            </AlertDialogContent>
                                          </AlertDialog>
                                        )}
                                        {(user.role === 'owner' || user.role === 'admin') && u.role === 'admin' && u.id !== user.id && (
                                          <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={updateUserMutation.isPending}
                                              >
                                                <ShieldOff className="h-4 w-4 mr-1" />
                                                {t('admin.users_table.remove_admin')}
                                              </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                              <AlertDialogHeader>
                                                <AlertDialogTitle>{t('admin.users_table.remove_admin')}</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                  {t('admin.users_table.remove_admin_confirm', { username: u.username })}
                                                </AlertDialogDescription>
                                              </AlertDialogHeader>
                                              <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction
                                                  onClick={() => {
                                                    updateUserMutation.mutate({
                                                      userId: u.id,
                                                      data: {
                                                        role: 'user',
                                                        isAdmin: false
                                                      }
                                                    });
                                                  }}
                                                >
                                                  {t('admin.users_table.remove_admin')}
                                                </AlertDialogAction>
                                              </AlertDialogFooter>
                                            </AlertDialogContent>
                                          </AlertDialog>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="reports" style={{ position: 'relative', zIndex: 1 }}>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle>Content Reports</CardTitle>
                  <div className="flex gap-2">
                    <Button
                      variant={reportFilter === "all" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setReportFilter("all")}
                    >
                      {t('admin.reports_table.status_all')}
                    </Button>
                    <Button
                      variant={reportFilter === "pending" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setReportFilter("pending")}
                    >
                      {t('admin.reports_table.status_pending')}
                    </Button>
                    <Button
                      variant={reportFilter === "resolved" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setReportFilter("resolved")}
                    >
                      {t('admin.reports_table.status_resolved')}
                    </Button>
                    <Button
                      variant={reportFilter === "rejected" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setReportFilter("rejected")}
                    >
                      {t('admin.reports_table.status_rejected')}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {reportsLoading ? (
                    <div className="relative overflow-hidden rounded-b-lg">
                      <div className="overflow-auto h-[600px]">
                        <Table>
                          <TableHeader className="sticky top-0 bg-card z-20 border-b">
                            <TableRow>
                              <TableHead className="w-[150px]">Reporter</TableHead>
                              <TableHead className="w-[100px]">Type</TableHead>
                              <TableHead className="w-[300px]">Content</TableHead>
                              <TableHead className="w-[200px]">Reason</TableHead>
                              <TableHead className="w-[100px]">Status</TableHead>
                              <TableHead className="w-[200px]">Reported On</TableHead>
                              <TableHead className="sticky right-0 bg-card w-[150px] z-20">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {[...Array(5)].map((_, i) => (
                              <ReportRowSkeleton key={i} />
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ) : (
                    <div className="relative overflow-hidden rounded-b-lg">
                      <div className="overflow-auto h-[600px]">
                        <Table>
                          <TableHeader className="sticky top-0 bg-card z-20 border-b">
                            <TableRow>
                              <TableHead className="w-[150px]">{t('admin.reports_table.reporter')}</TableHead>
                              <TableHead className="w-[150px]">{t('admin.reports_table.poster')}</TableHead>
                              <TableHead className="w-[100px]">{t('admin.reports_table.type')}</TableHead>
                              <TableHead className="w-[250px]">{t('admin.reports_table.content')}</TableHead>
                              <TableHead className="w-[180px]">{t('admin.reports_table.reason')}</TableHead>
                              <TableHead className="w-[100px]">{t('admin.reports_table.status')}</TableHead>
                              <TableHead className="w-[180px]">{t('admin.reports_table.reported_on')}</TableHead>
                              <TableHead className="sticky right-0 bg-card w-[150px] z-20">{t('admin.reports_table.actions')}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredReports?.map((report) => (
                              <TableRow key={report.id}>
                                <TableCell>{report.reporter?.username}</TableCell>
                                <TableCell>
                                  {report.content?.author?.username || 'Unknown'}
                                </TableCell>
                                <TableCell>
                                  {report.content?.type === 'post' ? t('admin.reports_table.type_post') :
                                    report.content?.type === 'discussion' ? t('admin.reports_table.type_discussion') :
                                      t('admin.reports_table.type_comment')}
                                </TableCell>
                                <TableCell className="max-w-xs truncate">
                                  {report.content?.title || report.content?.content || 'Content deleted'}
                                </TableCell>
                                <TableCell>{report.reason}</TableCell>
                                <TableCell>
                                  <Badge variant={
                                    report.status === "resolved" ? "default" :
                                      report.status === "rejected" ? "destructive" : "secondary"
                                  }>
                                    {t(`admin.reports_table.status_${report.status}`)}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {format(new Date(report.createdAt), "PPp")}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center space-x-2">
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          disabled={report.status !== "pending" || updateReportMutation.isPending}
                                        >
                                          <CheckCircle className="h-4 w-4" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>{t('admin.reports_table.resolve_title')}</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            {t('admin.reports_table.resolve_desc')}
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
                                          <AlertDialogAction
                                            onClick={() => updateReportMutation.mutate({ reportId: report.id, status: "resolved" })}
                                          >
                                            {t('admin.reports_table.resolve')}
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          disabled={report.status !== "pending" || updateReportMutation.isPending}
                                        >
                                          <XCircle className="h-4 w-4" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>{t('admin.reports_table.reject_title')}</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            {t('admin.reports_table.reject_desc')}
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
                                          <AlertDialogAction
                                            onClick={() => updateReportMutation.mutate({ reportId: report.id, status: "rejected" })}
                                          >
                                            {t('admin.reports_table.reject')}
                                          </AlertDialogAction>
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
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div >
      </main >
    </>
  );
}