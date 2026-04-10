import { useQuery, useMutation } from "@tanstack/react-query";
import { Community, User, Report, CommunityBan } from "@shared/schema";
import { Navbar } from "@/components/layout/navbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldAlert, Gavel, UserX } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  ExternalLink,
  MoreHorizontal,
  Shield,
  Ban,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Search,
  UserPlus,
  Trash2,
  Flag,
  Eye,
  UserMinus,
  Crown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Link } from "wouter";
import { useTranslation } from "react-i18next";

export default function ModPanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null);

  const { data: communities, isLoading: isLoadingCommunities } = useQuery<Community[]>({
    queryKey: ["/api/user/moderated-communities"],
  });

  // Effect to select first community by default
  if (communities && communities.length > 0 && !selectedCommunityId) {
    setSelectedCommunityId(communities[0].id.toString());
  }

  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 pt-24 pb-12">
        <h1 className="text-3xl font-bold mb-8 flex items-center gap-2">
          <ShieldAlert className="h-8 w-8 text-primary" />
          {t("mod_panel.title")}
        </h1>

        {isLoadingCommunities ? (
          <div className="flex justify-center p-12"><Spinner /></div>
        ) : !communities || communities.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              {t("mod_panel.no_communities")}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Sidebar for Community Selection */}
            <div className="md:col-span-1 space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {t("mod_panel.my_communities")}
              </h2>
              {communities.map((c) => (
                <Button
                  key={c.id}
                  variant={selectedCommunityId === c.id.toString() ? "default" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => setSelectedCommunityId(c.id.toString())}
                >
                  {c.name}
                </Button>
              ))}
            </div>

            {/* Main Content Area */}
            <div className="md:col-span-3">
              {selectedCommunityId && <ModContext communityId={parseInt(selectedCommunityId)} />}
            </div>
          </div>
        )}
      </main>
    </>
  );
}

function ModContext({ communityId }: { communityId: number }) {
  const { t } = useTranslation();
  
  const { data: requests } = useQuery<any[]>({
    queryKey: ["/api/communities", communityId, "requests"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/communities/${communityId}/requests`);
      return res.json();
    },
  });

  const pendingCount = requests?.length || 0;

  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="grid w-full grid-cols-3 md:grid-cols-6">
        <TabsTrigger value="overview">{t("mod_panel.tabs.overview")}</TabsTrigger>
        <TabsTrigger value="files">{t("mod_panel.tabs.reports")}</TabsTrigger>
        <TabsTrigger value="requests" className="relative">
          {t("mod_panel.tabs.requests")}
          {pendingCount > 0 && (
            <Badge variant="destructive" className="ml-2 px-1.5 py-0.5 text-[10px] min-w-[18px] justify-center">
              {pendingCount}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="members">{t("mod_panel.tabs.members")}</TabsTrigger>
        <TabsTrigger value="bans">{t("mod_panel.tabs.bans")}</TabsTrigger>
        <TabsTrigger value="moderators">{t("mod_panel.tabs.staff")}</TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        <Card>
          <CardHeader>
            <CardTitle>{t("mod_panel.overview.title")}</CardTitle>
            <CardDescription>{t("mod_panel.overview.desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{t("mod_panel.overview.select_prompt")}</p>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="files">
        <ReportsManager communityId={communityId} />
      </TabsContent>

      <TabsContent value="requests">
        <RequestsManager communityId={communityId} />
      </TabsContent>

      <TabsContent value="members">
        <MembersManager communityId={communityId} />
      </TabsContent>

      <TabsContent value="bans">
        <BansManager communityId={communityId} />
      </TabsContent>

      <TabsContent value="moderators">
        <ModeratorsManager communityId={communityId} />
      </TabsContent>
    </Tabs>
  );
}

function ReportsManager({ communityId }: { communityId: number }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const { data: reports, isLoading } = useQuery<Report[]>({
    queryKey: ["/api/communities", communityId, "reports"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/communities/${communityId}/reports`);
      return res.json();
    },
  });

  const updateReportMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await apiRequest("PATCH", `/api/communities/${communityId}/reports/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/communities", communityId, "reports"] });
      toast({
        title: t("mod_panel.reports.updated_title"),
        description: t("mod_panel.reports.updated_desc"),
      });
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    },
  });

  const filteredReports =
    reports?.filter((r) => filterStatus === "all" || r.status === filterStatus) || [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="w-64">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger>
              <SelectValue placeholder={t("mod_panel.reports.filter_placeholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("mod_panel.reports.all")}</SelectItem>
              <SelectItem value="pending">{t("mod_panel.reports.pending")}</SelectItem>
              <SelectItem value="resolved">{t("mod_panel.reports.resolved")}</SelectItem>
              <SelectItem value="rejected">{t("mod_panel.reports.rejected")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("mod_panel.reports.table.type")}</TableHead>
              <TableHead>{t("mod_panel.reports.table.reason")}</TableHead>
              <TableHead>{t("mod_panel.reports.table.status")}</TableHead>
              <TableHead>{t("mod_panel.reports.table.date")}</TableHead>
              <TableHead className="text-right">{t("mod_panel.reports.table.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <Spinner className="mx-auto" />
                </TableCell>
              </TableRow>
            ) : filteredReports.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center p-0">
                  <EmptyState title={t("mod_panel.reports.table.empty")} description="No reports match your filters." />
                </TableCell>
              </TableRow>
            ) : (
              filteredReports.map((report) => (
                <TableRow key={report.id}>
                  <TableCell>
                    {report.postId ? (
                      <Badge variant="outline">{t("mod_panel.reports.types.post")}</Badge>
                    ) : report.commentId ? (
                      <Badge variant="outline">{t("mod_panel.reports.types.comment")}</Badge>
                    ) : (
                      <Badge variant="outline">{t("mod_panel.reports.types.other")}</Badge>
                    )}
                  </TableCell>
                  <TableCell>{report.reason}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        report.status === "pending"
                          ? "destructive"
                          : report.status === "resolved"
                            ? "default"
                            : "secondary"
                      }
                    >
                      {report.status.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(report.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {report.status === "pending" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              updateReportMutation.mutate({ id: report.id, status: "resolved" })
                            }
                            disabled={updateReportMutation.isPending}
                          >
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              updateReportMutation.mutate({ id: report.id, status: "rejected" })
                            }
                            disabled={updateReportMutation.isPending}
                          >
                            <XCircle className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function MembersManager({ communityId }: { communityId: number }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");

  const { data: members, isLoading } = useQuery<any[]>({
    queryKey: ["/api/communities", communityId, "members"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/communities/${communityId}/members`);
      return res.json();
    },
  });

  const kickMutation = useMutation({
    mutationFn: async (userId: number) => {
      await apiRequest("DELETE", `/api/communities/${communityId}/members/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/communities", communityId, "members"] });
      toast({
        title: t("mod_panel.members.kicked_title"),
        description: t("mod_panel.members.kicked_desc"),
      });
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: number; role: string }) => {
      await apiRequest("PATCH", `/api/communities/${communityId}/members/${userId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/communities", communityId, "members"] });
      toast({
        title: t("mod_panel.members.role_updated_title"),
        description: t("mod_panel.members.role_updated_desc"),
      });
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    },
  });

  const currentUserMember = members?.find((m) => m.user.id === currentUser?.id);
  const isOwner = currentUserMember?.role === "owner" || currentUser?.role === "admin" || currentUser?.role === "owner";

  const filteredMembers =
    members?.filter((m) => m.user.username.toLowerCase().includes(searchTerm.toLowerCase())) || [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="relative w-72">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("mod_panel.members.search_placeholder")}
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("mod_panel.members.table.user")}</TableHead>
              <TableHead>{t("mod_panel.members.table.role")}</TableHead>
              <TableHead className="text-right">{t("mod_panel.members.table.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center">
                  <Spinner className="mx-auto" />
                </TableCell>
              </TableRow>
            ) : filteredMembers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center p-0">
                  <EmptyState title={t("mod_panel.members.table.empty")} description="No members found matching your search." />
                </TableCell>
              </TableRow>
            ) : (
              filteredMembers.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col">
                        <span className="flex items-center gap-1">
                          {member.user.username}
                          {member.role === "owner" && <Crown className="h-3 w-3 text-amber-500 fill-amber-500" />}
                        </span>
                        <span className="text-[9px] font-mono text-muted-foreground">ID: {member.user.id}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.role === "member" ? "secondary" : "default"} className="flex items-center gap-1 w-fit">
                      {member.role === "owner" && <Crown className="h-2.5 w-2.5" />}
                      {member.role.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {currentUser?.id !== member.user.id && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-destructive">
                              <UserMinus className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {t("mod_panel.members.kick_dialog.title")}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("mod_panel.members.kick_dialog.desc", {
                                  name: member.user.username,
                                })}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>
                                {t("mod_panel.members.kick_dialog.cancel")}
                              </AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => kickMutation.mutate(member.user.id)}
                              >
                                {t("mod_panel.members.kick_dialog.confirm")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                      {isOwner && currentUser?.id !== member.user.id && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => updateRoleMutation.mutate({ userId: member.user.id, role: "member" })}
                              disabled={member.role === "member"}
                            >
                              {t("mod_panel.members.demote_member")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => updateRoleMutation.mutate({ userId: member.user.id, role: "moderator" })}
                              disabled={member.role === "moderator"}
                            >
                              {t("mod_panel.members.promote_mod")}
                            </DropdownMenuItem>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                  {t("mod_panel.members.promote_owner")}
                                </DropdownMenuItem>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{t("mod_panel.members.confirm_owner_title")}</AlertDialogTitle>
                                  <AlertDialogDescription>{t("mod_panel.members.confirm_owner_desc")}</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => updateRoleMutation.mutate({ userId: member.user.id, role: "owner" })}>
                                    {t("common.confirm")}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function BansManager({ communityId }: { communityId: number }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [banUserId, setBanUserId] = useState("");
  const [banReason, setBanReason] = useState("");

  const { data: bans, isLoading } = useQuery<(CommunityBan & { user: User })[]>({
    queryKey: ["/api/communities", communityId, "bans"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/communities/${communityId}/bans`);
      return res.json();
    },
  });

  const banMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/communities/${communityId}/ban`, {
        userId: parseInt(banUserId),
        reason: banReason,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/communities", communityId, "bans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/communities", communityId, "members"] });
      setBanUserId("");
      setBanReason("");
      setBanDialogOpen(false);
      toast({
        title: t("mod_panel.bans.banned_title"),
        description: t("mod_panel.bans.banned_desc"),
      });
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    },
  });

  const unbanMutation = useMutation({
    mutationFn: async (userId: number) => {
      await apiRequest("DELETE", `/api/communities/${communityId}/ban/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/communities", communityId, "bans"] });
      toast({
        title: t("mod_panel.bans.unbanned_title"),
        description: t("mod_panel.bans.unbanned_desc"),
      });
    },
  });

  const filteredBans =
    bans?.filter(
      (b) =>
        b.user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.userId.toString().includes(searchTerm),
    ) || [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="relative w-72">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("mod_panel.bans.search_placeholder")}
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Dialog open={banDialogOpen} onOpenChange={setBanDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive">
              <Ban className="mr-2 h-4 w-4" /> {t("mod_panel.bans.ban_button")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("mod_panel.bans.ban_dialog.title")}</DialogTitle>
              <DialogDescription>{t("mod_panel.bans.ban_dialog.desc")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t("mod_panel.bans.ban_dialog.user_id_label")}</Label>
                <Input
                  placeholder={t("mod_panel.bans.ban_dialog.user_id_placeholder")}
                  value={banUserId}
                  onChange={(e) => setBanUserId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("mod_panel.bans.ban_dialog.reason_label")}</Label>
                <Input
                  placeholder={t("mod_panel.bans.ban_dialog.reason_placeholder")}
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBanDialogOpen(false)}>
                {t("mod_panel.bans.ban_dialog.cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={() => banMutation.mutate()}
                disabled={!banUserId || banMutation.isPending}
              >
                {banMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("mod_panel.bans.ban_dialog.confirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("mod_panel.bans.table.user")}</TableHead>
              <TableHead>{t("mod_panel.bans.table.reason")}</TableHead>
              <TableHead>{t("mod_panel.bans.table.date")}</TableHead>
              <TableHead className="text-right">{t("mod_panel.bans.table.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  <Spinner className="mx-auto" />
                </TableCell>
              </TableRow>
            ) : filteredBans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center p-0">
                  <EmptyState title={t("mod_panel.bans.table.empty")} description="No bans found in this community." />
                </TableCell>
              </TableRow>
            ) : (
              filteredBans.map((ban) => (
                <TableRow key={ban.id}>
                  <TableCell>
                    <div className="font-medium">{ban.user.username}</div>
                    <div className="text-xs text-muted-foreground">
                      {t("mod_panel.bans.table.id")} {ban.userId}
                    </div>
                  </TableCell>
                  <TableCell>{ban.reason || t("mod_panel.bans.table.no_reason")}</TableCell>
                  <TableCell>{new Date(ban.bannedAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Remove ban">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {t("mod_panel.bans.unban_dialog.title")}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("mod_panel.bans.unban_dialog.desc", { name: ban.user.username })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>
                            {t("mod_panel.bans.unban_dialog.cancel")}
                          </AlertDialogCancel>
                          <AlertDialogAction onClick={() => unbanMutation.mutate(ban.userId)}>
                            {t("mod_panel.bans.unban_dialog.confirm")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ModeratorsManager({ communityId }: { communityId: number }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [modUserId, setModUserId] = useState("");
  const [modDialogOpen, setModDialogOpen] = useState(false);

  const { data: members, isLoading } = useQuery<any[]>({
    queryKey: ["/api/communities", communityId, "members"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/communities/${communityId}/members`);
      return res.json();
    },
  });

  const mods = members?.filter((m) => m.role === "moderator" || m.role === "owner") || [];

  const addModMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/communities/${communityId}/moderators`, {
        userId: parseInt(modUserId),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/communities", communityId, "members"] });
      setModUserId("");
      setModDialogOpen(false);
      toast({
        title: t("mod_panel.staff.added_title"),
        description: t("mod_panel.staff.added_desc"),
      });
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">{t("mod_panel.staff.title")}</h3>
        <Dialog open={modDialogOpen} onOpenChange={setModDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" /> {t("mod_panel.staff.add_button")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("mod_panel.staff.add_dialog.title")}</DialogTitle>
              <DialogDescription>{t("mod_panel.staff.add_dialog.desc")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t("mod_panel.staff.add_dialog.user_id_label")}</Label>
                <Input
                  placeholder={t("mod_panel.staff.add_dialog.user_id_placeholder")}
                  value={modUserId}
                  onChange={(e) => setModUserId(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setModDialogOpen(false)}>
                {t("mod_panel.staff.add_dialog.cancel")}
              </Button>
              <Button
                onClick={() => addModMutation.mutate()}
                disabled={!modUserId || addModMutation.isPending}
              >
                {addModMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("mod_panel.staff.add_dialog.confirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("mod_panel.members.table.user")}</TableHead>
              <TableHead>{t("mod_panel.members.table.role")}</TableHead>
              <TableHead className="text-right">{t("mod_panel.members.table.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center">
                  <Spinner className="mx-auto" />
                </TableCell>
              </TableRow>
            ) : (
              mods.map((mod) => (
                <TableRow key={mod.id}>
                  <TableCell className="font-medium">{mod.user.username}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{mod.role.toUpperCase()}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{/* Future: Remove Mod action */}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function RequestsManager({ communityId }: { communityId: number }) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { data: requests, isLoading } = useQuery<any[]>({
    queryKey: ["/api/communities", communityId, "requests"],
  });

  const approveMutation = useMutation({
    mutationFn: async (userId: number) => {
      await apiRequest("POST", `/api/communities/${communityId}/requests/${userId}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/communities", communityId, "requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/communities", communityId, "members"] });
      toast({
        title: t("mod_panel.requests.approved_title"),
        description: t("mod_panel.requests.approved_desc"),
      });
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    },
  });

  const declineMutation = useMutation({
    mutationFn: async (userId: number) => {
      await apiRequest("POST", `/api/communities/${communityId}/requests/${userId}/decline`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/communities", communityId, "requests"] });
      toast({
        title: t("mod_panel.requests.declined_title"),
        description: t("mod_panel.requests.declined_desc"),
      });
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("mod_panel.requests.table.user")}</TableHead>
              <TableHead>{t("mod_panel.requests.table.date")}</TableHead>
              <TableHead className="text-right">{t("mod_panel.requests.table.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center">
                  <Spinner className="mx-auto" />
                </TableCell>
              </TableRow>
            ) : requests?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center p-0">
                  <EmptyState 
                    title={t("mod_panel.requests.table.empty")} 
                    description="When users request to join this private community, they will appear here." 
                  />
                </TableCell>
              </TableRow>
            ) : (
              requests?.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                       <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-[10px] font-bold">
                          {request.user?.username?.charAt(0).toUpperCase() || "?"}
                        </span>
                      </div>
                      {request.user?.username || "Unknown User"}
                    </div>
                  </TableCell>
                  <TableCell>{new Date(request.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => approveMutation.mutate(request.userId)}
                        disabled={approveMutation.isPending}
                      >
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => declineMutation.mutate(request.userId)}
                        disabled={declineMutation.isPending}
                      >
                        <XCircle className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function SkeletonLoader() {
  return (
    <div className="space-y-4">
      <div className="h-8 bg-muted rounded w-1/3"></div>
      <div className="h-32 bg-muted rounded w-full"></div>
    </div>
  );
}
