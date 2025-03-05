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
import { format } from "date-fns";
import { User, Report } from "@shared/schema";
import {
  Loader2, Shield, Users, Flag, CheckCircle, XCircle, Search,
  Ban, Check, AlertTriangle, Trophy, BadgeCheck, Activity,
  TrendingUp, UserCheck, UserX, MessagesSquare
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { UserAvatar } from "@/components/ui/user-avatar";

// Extended Report type to include additional fields
interface ExtendedReport extends Report {
  reporter?: {
    username: string;
  };
  reportedContent?: {
    type: 'post' | 'discussion' | 'comment';
    title?: string;
    content: string;
  };
}

interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  verifiedUsers: number;
  bannedUsers: number;
  totalPosts: number;
  totalReports: number;
  pendingReports: number;
  resolvedReports: number;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [userFilter, setUserFilter] = useState<"all" | "verified" | "banned">("all");
  const [reportFilter, setReportFilter] = useState<"all" | "pending" | "resolved">("all");

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
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "Success",
        description: "User updated successfully",
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

  const filteredUsers = users?.filter(user => {
    const matchesSearch = user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());

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
    return true;
  });

  const handleReportAction = (reportId: number, status: string) => {
    if (window.confirm(`Are you sure you want to ${status === 'resolved' ? 'resolve' : 'reject'} this report? ${status === 'resolved' ? 'This will delete the reported content.' : ''}`)) {
      updateReportMutation.mutate({ reportId, status });
    }
  };

  const handleVerificationToggle = async (userId: number, currentVerified: boolean) => {
    const action = currentVerified ? 'unverify' : 'verify';
    if (window.confirm(`Are you sure you want to ${action} this user?`)) {
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
          description: `User ${action}d successfully`,
        });
      } catch (error) {
        console.error('Error toggling verification:', error);
        toast({
          title: "Error",
          description: `Failed to ${action} user`,
          variant: "destructive"
        });
      }
    }
  };

  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 pt-24 pb-8">
        <div className="max-w-[1400px] mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <Shield className="h-8 w-8 text-primary" />
              <h1 className="text-4xl font-bold">Admin Dashboard</h1>
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
                Reset All Roles
              </Button>
            )}
          </div>

          {/* Statistics Cards */}
          {statsLoading ? (
            <div className="grid gap-4 md:grid-cols-4 mb-8">
              {[...Array(8)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader className="space-y-2">
                    <div className="h-4 bg-muted rounded w-1/2" />
                    <div className="h-8 bg-muted rounded w-3/4" />
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-4 mb-8">
              <Card>
                <CardHeader>
                  <CardDescription className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Total Users
                  </CardDescription>
                  <CardTitle>{stats?.totalUsers || 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription className="flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Active Users
                  </CardDescription>
                  <CardTitle>{stats?.activeUsers || 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4" />
                    Verified Users
                  </CardDescription>
                  <CardTitle>{stats?.verifiedUsers || 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription className="flex items-center gap-2">
                    <UserX className="h-4 w-4" />
                    Banned Users
                  </CardDescription>
                  <CardTitle>{stats?.bannedUsers || 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription className="flex items-center gap-2">
                    <MessagesSquare className="h-4 w-4" />
                    Total Posts
                  </CardDescription>
                  <CardTitle>{stats?.totalPosts || 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription className="flex items-center gap-2">
                    <Flag className="h-4 w-4" />
                    Total Reports
                  </CardDescription>
                  <CardTitle>{stats?.totalReports || 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Pending Reports
                  </CardDescription>
                  <CardTitle>{stats?.pendingReports || 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Resolved Reports
                  </CardDescription>
                  <CardTitle>{stats?.resolvedReports || 0}</CardTitle>
                </CardHeader>
              </Card>
            </div>
          )}

          <Tabs defaultValue="users" className="space-y-4">
            <TabsList>
              <TabsTrigger value="users" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Users
              </TabsTrigger>
              <TabsTrigger value="reports" className="flex items-center gap-2">
                <Flag className="h-4 w-4" />
                Reports
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
                        All
                      </Button>
                      <Button
                        variant={userFilter === "verified" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setUserFilter("verified")}
                      >
                        Verified
                      </Button>
                      <Button
                        variant={userFilter === "banned" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setUserFilter("banned")}
                      >
                        Banned
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
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : (
                    <div className="relative overflow-hidden rounded-b-lg">
                      <div className="overflow-auto h-[600px]">
                        <Table>
                          <TableHeader className="sticky top-0 bg-card z-20 border-b"> {/*Added z-index*/}
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
                                    <Badge variant={u.emailVerified ? "default" : "secondary"}>
                                      {u.emailVerified ? "Verified" : "Unverified"}
                                    </Badge>
                                    {u.verified && (
                                      <Badge variant="default" className="bg-blue-500 flex items-center gap-1">
                                        <BadgeCheck className="h-4 w-4 text-white flex-shrink-0" />
                                        <span className="text-sm">Verified</span>
                                      </Badge>
                                    )}
                                    {u.karma < 0 && (
                                      <Badge variant="destructive" className="ml-2">
                                        Banned
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
                                    {u.role}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge variant={u.karma >= 0 ? "default" : "destructive"} className="flex items-center gap-1">
                                    <Trophy className="h-3 w-3" />
                                    {u.karma} reputation
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {format(new Date(u.createdAt), "PPp")}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center space-x-2">
                                    {(user.role === 'owner' || (user.role === 'admin' && u.role === 'user')) && (
                                      <>
                                        <Button
                                          size="sm"
                                          variant={u.verified ? "default" : "outline"}
                                          onClick={() => handleVerificationToggle(u.id, u.verified)}
                                          disabled={updateUserMutation.isPending}
                                          className="flex items-center gap-1"
                                        >
                                          <BadgeCheck className="h-4 w-4 flex-shrink-0" />
                                          {u.verified ? "Remove Verification" : "Verify User"}
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant={u.karma < 0 ? "default" : "destructive"}
                                          onClick={() => {
                                            const action = u.karma < 0 ? 'restore' : 'ban';
                                            const newKarma = u.karma < 0 ? 5 : -100;

                                            if (window.confirm(
                                              action === 'ban'
                                                ? `Are you sure you want to ban ${u.username}? This will prevent them from accessing most features.`
                                                : `Are you sure you want to restore ${u.username}'s account?`
                                            )) {
                                              updateUserMutation.mutate({
                                                userId: u.id,
                                                data: { karma: newKarma }
                                              });
                                            }
                                          }}
                                          disabled={updateUserMutation.isPending}
                                        >
                                          {u.karma < 0 ? (
                                            <>
                                              <Check className="h-4 w-4 mr-1" />
                                              Restore Account
                                            </>
                                          ) : (
                                            <>
                                              <Ban className="h-4 w-4 mr-1" />
                                              Ban User
                                            </>
                                          )}
                                        </Button>
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
                                              Unverify
                                            </>
                                          ) : (
                                            <>
                                              <Check className="h-4 w-4 mr-1" />
                                              Verify
                                            </>
                                          )}
                                        </Button>
                                        {(user.role === 'owner' || user.role === 'admin') && u.role === 'user' && (
                                          <Button
                                            size="sm"
                                            variant="default"
                                            onClick={() => {
                                              if (window.confirm(`Are you sure you want to make ${u.username} an admin? This will give them administrative privileges.`)) {
                                                updateUserMutation.mutate({
                                                  userId: u.id,
                                                  data: {
                                                    role: 'admin',
                                                    isAdmin: true
                                                  }
                                                });
                                              }
                                            }}
                                            disabled={updateUserMutation.isPending}
                                          >
                                            <Shield className="h-4 w-4 mr-1" />
                                            Make Admin
                                          </Button>
                                        )}
                                        {user.role === 'owner' && u.role === 'admin' && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                              if (window.confirm(`Are you sure you want to remove ${u.username}'s admin privileges? They will be demoted to a regular user.`)) {
                                                updateUserMutation.mutate({
                                                  userId: u.id,
                                                  data: {
                                                    role: 'user',
                                                    isAdmin: false
                                                  }
                                                });
                                              }
                                            }}
                                            disabled={updateUserMutation.isPending}
                                          >
                                            <Shield className="h-4 w-4 mr-1" />
                                            Remove Admin
                                          </Button>
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

            <TabsContent value="reports" style={{position: 'relative', zIndex: 1}}> {/*Added style for new stacking context*/}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle>Content Reports</CardTitle>
                  <div className="flex gap-2">
                    <Button
                      variant={reportFilter === "all" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setReportFilter("all")}
                    >
                      All
                    </Button>
                    <Button
                      variant={reportFilter === "pending" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setReportFilter("pending")}
                    >
                      Pending
                    </Button>
                    <Button
                      variant={reportFilter === "resolved" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setReportFilter("resolved")}
                    >
                      Resolved
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {reportsLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : (
                    <div className="relative overflow-hidden rounded-b-lg">
                      <div className="overflow-auto h-[600px]">
                        <Table>
                          <TableHeader className="sticky top-0 bg-card z-20 border-b"> {/*Added z-index*/}
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
                            {filteredReports?.map((report) => (
                              <TableRow key={report.id}>
                                <TableCell>{report.reporter?.username}</TableCell>
                                <TableCell>
                                  {report.reportedContent?.type === 'post' ? "Post" :
                                    report.reportedContent?.type === 'discussion' ? "Discussion" :
                                      "Comment"}
                                </TableCell>
                                <TableCell className="max-w-xs truncate">
                                  {report.reportedContent?.title || report.reportedContent?.content}
                                </TableCell>
                                <TableCell>{report.reason}</TableCell>
                                <TableCell>
                                  <Badge variant={
                                    report.status === "resolved" ? "default" :
                                      report.status === "rejected" ? "destructive" : "secondary"
                                  }>
                                    {report.status}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {format(new Date(report.createdAt), "PPp")}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center space-x-2">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleReportAction(report.id, "resolved")}
                                      disabled={report.status !== "pending" || updateReportMutation.isPending}
                                    >
                                      <CheckCircle className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleReportAction(report.id, "rejected")}
                                      disabled={report.status !== "pending" || updateReportMutation.isPending}
                                    >
                                      <XCircle className="h-4 w-4" />
                                    </Button>
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
        </div>
      </main>
    </>
  );
}