import { Navbar } from "@/components/layout/navbar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import { Loader2, Shield, Users, Flag, CheckCircle, XCircle, Search, Ban, Check, AlertTriangle } from "lucide-react";
import { useState } from "react";

export default function AdminDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");

  // Allow any user with admin privileges to access admin features
  if (!user || !user.isAdmin) {
    return <Redirect to="/" />;
  }

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: reports, isLoading: reportsLoading } = useQuery<Report[]>({
    queryKey: ["/api/admin/reports"],
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
        description: "Failed to update report status",
        variant: "destructive",
      });
    },
  });

  const filteredUsers = users?.filter(user =>
    user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleReportAction = (reportId: number, status: string) => {
    if (window.confirm(`Are you sure you want to ${status === 'resolved' ? 'resolve' : 'reject'} this report? ${status === 'resolved' ? 'This will delete the reported content.' : ''}`)) {
      updateReportMutation.mutate({ reportId, status });
    }
  };

  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 pt-24">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <Shield className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold">Admin Dashboard</h1>
          </div>

          <Tabs defaultValue="users">
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

            <TabsContent value="users" className="mt-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle>User Management</CardTitle>
                  <div className="flex items-center space-x-2">
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
                <CardContent>
                  {usersLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Username</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Karma</TableHead>
                          <TableHead>Joined</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers?.map((user) => (
                          <TableRow key={user.id}>
                            <TableCell className="font-medium">{user.username}</TableCell>
                            <TableCell>{user.email}</TableCell>
                            <TableCell>
                              <Badge variant={user.emailVerified ? "default" : "secondary"}>
                                {user.emailVerified ? "Verified" : "Unverified"}
                              </Badge>
                              {user.karma < 0 && (
                                <Badge variant="destructive" className="ml-2">
                                  Banned
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={user.isAdmin ? "destructive" : "default"}>
                                {user.isAdmin ? "Admin" : "User"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={user.karma >= 0 ? "default" : "destructive"}>
                                {user.karma}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {format(new Date(user.createdAt), "PPp")}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-2">
                                {!user.isAdmin && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant={user.karma < 0 ? "default" : "destructive"}
                                      onClick={() => {
                                        const action = user.karma < 0 ? 'restore' : 'ban';
                                        const newKarma = user.karma < 0 ? 5 : -100;

                                        if (window.confirm(
                                          action === 'ban'
                                            ? `Are you sure you want to ban ${user.username}? This will prevent them from accessing most features.`
                                            : `Are you sure you want to restore ${user.username}'s account?`
                                        )) {
                                          updateUserMutation.mutate({
                                            userId: user.id,
                                            data: { karma: newKarma }
                                          });
                                        }
                                      }}
                                      disabled={updateUserMutation.isPending}
                                    >
                                      {user.karma < 0 ? (
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
                                    {user.karma >= 0 && (
                                      <>
                                        <Button
                                          size="sm"
                                          variant={user.emailVerified ? "ghost" : "default"}
                                          onClick={() => updateUserMutation.mutate({
                                            userId: user.id,
                                            data: { emailVerified: !user.emailVerified }
                                          })}
                                          disabled={updateUserMutation.isPending}
                                        >
                                          {user.emailVerified ? (
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
                                        <Button
                                          size="sm"
                                          variant="default"
                                          onClick={() => {
                                            if (window.confirm(`Are you sure you want to make ${user.username} an admin? This will give them full administrative privileges.`)) {
                                              updateUserMutation.mutate({
                                                userId: user.id,
                                                data: { isAdmin: true }
                                              });
                                            }
                                          }}
                                          disabled={updateUserMutation.isPending}
                                        >
                                          <Shield className="h-4 w-4 mr-1" />
                                          Make Admin
                                        </Button>
                                      </>
                                    )}
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="reports" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Content Reports</CardTitle>
                </CardHeader>
                <CardContent>
                  {reportsLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Reporter</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Content</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Reported On</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reports?.map((report) => (
                          <TableRow key={report.id}>
                            <TableCell>{report.reporter?.username}</TableCell>
                            <TableCell>
                              {report.content?.type === 'post' ? "Post" :
                                report.content?.type === 'discussion' ? "Discussion" :
                                "Comment"}
                            </TableCell>
                            <TableCell className="max-w-xs truncate">
                              {report.content?.type === 'post' ? report.content.title :
                                report.content?.type === 'discussion' ? report.content.title :
                                report.content?.content}
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