import { useQuery, useMutation } from "@tanstack/react-query";
import type { Community, User, Report, CommunityBan } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldAlert } from "lucide-react";
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
import { MoreHorizontal, Ban, CheckCircle2, XCircle, Search, UserPlus, UserMinus, Crown, UserRound, ShieldCheck, ShieldOff, Undo2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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

import { useTranslation } from "react-i18next";
import { Link } from "wouter";

export default function ModPanel() {
  const { t } = useTranslation();
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
            <main className="container mx-auto px-4 pt-6 md:pt-8 pb-12">
        <h1 className="ov-rule font-display text-[32px] md:text-[40px] font-semibold leading-none tracking-[-0.01em] pb-5 mb-8 flex items-center gap-3">
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
              <h2 className="ov-label mb-2">
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
      <TabsList className="grid h-auto w-full grid-cols-3 md:grid-cols-5">
        <TabsTrigger value="overview">{t("mod_panel.tabs.overview")}</TabsTrigger>
        <TabsTrigger value="files">{t("mod_panel.tabs.reports")}</TabsTrigger>
        <TabsTrigger value="requests" className="relative">
          {t("mod_panel.tabs.requests")}
          {pendingCount > 0 && (
            <Badge variant="destructive" className="ov-data ml-2 px-1.5 py-0.5 text-[10px] min-w-[18px] justify-center">
              {pendingCount}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="members">{t("mod_panel.tabs.members")}</TabsTrigger>
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

      <div className="ov-panel">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="ov-label">{t("mod_panel.reports.table.type")}</TableHead>
              <TableHead className="ov-label">{t("mod_panel.reports.table.reason")}</TableHead>
              <TableHead className="ov-label">{t("mod_panel.reports.table.status")}</TableHead>
              <TableHead className="ov-label">{t("mod_panel.reports.table.date")}</TableHead>
              <TableHead className="ov-label text-right">{t("mod_panel.reports.table.actions")}</TableHead>
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
                  <EmptyState title={t("mod_panel.reports.table.empty")} description={t("mod_panel.reports.no_match", "No reports match your filters.")} />
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
                      className="capitalize"
                    >
                      {t(`mod_panel.reports.${report.status}`, report.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="ov-data">{new Date(report.createdAt).toLocaleDateString()}</TableCell>
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
                            <CheckCircle2 className="h-4 w-4 text-primary" />
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
  const { t, i18n } = useTranslation();
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

  // Banned users are no longer members; they are listed here too so they can be unbanned.
  const { data: bans } = useQuery<(CommunityBan & { user: User })[]>({
    queryKey: ["/api/communities", communityId, "bans"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/communities/${communityId}/bans`);
      return res.json();
    },
  });

  // One dialog at a time for the action picked in a member's menu
  const [pending, setPending] = useState<
    { kind: "kick" | "ban" | "unban" | "owner"; userId: number; name: string } | null
  >(null);
  const [banReason, setBanReason] = useState("");
  const closeDialog = () => {
    setPending(null);
    setBanReason("");
  };
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/communities", communityId, "members"] });
    queryClient.invalidateQueries({ queryKey: ["/api/communities", communityId, "bans"] });
  };
  const onError = (err: Error) => {
    toast({ title: t("common.error"), description: err.message, variant: "destructive" });
  };

  const kickMutation = useMutation({
    mutationFn: async (userId: number) => {
      await apiRequest("DELETE", `/api/communities/${communityId}/members/${userId}`);
    },
    onSuccess: () => {
      refresh();
      closeDialog();
      toast({ title: t("mod_panel.members.kicked_title"), description: t("mod_panel.members.kicked_desc") });
    },
    onError,
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: number; role: string }) => {
      await apiRequest("PATCH", `/api/communities/${communityId}/members/${userId}/role`, { role });
    },
    onSuccess: () => {
      refresh();
      closeDialog();
      toast({ title: t("mod_panel.members.role_updated_title"), description: t("mod_panel.members.role_updated_desc") });
    },
    onError,
  });

  const banMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: number; reason: string }) => {
      await apiRequest("POST", `/api/communities/${communityId}/ban`, { userId, reason });
    },
    onSuccess: () => {
      refresh();
      closeDialog();
      toast({ title: t("mod_panel.bans.banned_title"), description: t("mod_panel.bans.banned_desc") });
    },
    onError,
  });

  const unbanMutation = useMutation({
    mutationFn: async (userId: number) => {
      await apiRequest("DELETE", `/api/communities/${communityId}/ban/${userId}`);
    },
    onSuccess: () => {
      refresh();
      closeDialog();
      toast({ title: t("mod_panel.bans.unbanned_title"), description: t("mod_panel.bans.unbanned_desc") });
    },
    onError,
  });

  const currentUserMember = members?.find((m) => m.user.id === currentUser?.id);
  const isGlobalAdmin = currentUser?.role === "admin" || currentUser?.role === "owner";
  // Only owners (and site admins) change roles; owners and moderators may kick and ban,
  // but moderators only plain members — the server enforces the same rules.
  const canChangeRoles = currentUserMember?.role === "owner" || isGlobalAdmin;
  const canModerate = (targetRole: string) =>
    targetRole !== "owner" && (canChangeRoles || (currentUserMember?.role === "moderator" && targetRole === "member"));
  const roleLabel = (role: string) => t(`mod_panel.roles.${role}`, role);

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteSearchQuery, setInviteSearchQuery] = useState("");
  const [inviteUserId, setInviteUserId] = useState("");

  const { data: inviteSearchResults, isLoading: invitingSearch } = useQuery<User[]>({
    queryKey: ["/api/users/search", inviteSearchQuery],
    queryFn: async () => {
      if (!inviteSearchQuery || inviteSearchQuery.length < 2) return [];
      const res = await apiRequest("GET", `/api/users/search?q=${encodeURIComponent(inviteSearchQuery)}`);
      return res.json();
    },
    enabled: inviteSearchQuery.length >= 2,
  });

  const inviteMutation = useMutation({
    mutationFn: async (userId: number) => {
      await apiRequest("POST", `/api/communities/${communityId}/invite`, {
        userId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/communities", communityId, "members"] });
      setInviteSearchQuery("");
      setInviteUserId("");
      setInviteDialogOpen(false);
      toast({
        title: t("mod_panel.requests.approved_title"),
        description: t("mod_panel.requests.approved_desc"),
      });
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    },
  });

  const query = searchTerm.toLowerCase();
  const filteredMembers = members?.filter((m) => m.user.username.toLowerCase().includes(query)) || [];
  const filteredBans = bans?.filter((b) => b.user.username.toLowerCase().includes(query)) || [];
  const busy = kickMutation.isPending || banMutation.isPending || unbanMutation.isPending || updateRoleMutation.isPending;

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
        <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" /> {t("mod_panel.members.invite_button")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("mod_panel.members.invite_dialog.title")}</DialogTitle>
              <DialogDescription>{t("mod_panel.members.invite_dialog.desc")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t("mod_panel.staff.add_dialog.user_id_label")}</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("admin.users_table.search_placeholder")}
                    className="pl-9"
                    value={inviteSearchQuery}
                    onChange={(e) => setInviteSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {invitingSearch && (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {inviteSearchResults && inviteSearchResults.length > 0 && (
                <div className="rounded-md border divide-y max-h-48 overflow-y-auto">
                  {inviteSearchResults.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="ov-avatar h-8 w-8 bg-primary/10 flex items-center justify-center font-semibold text-xs text-primary">
                          {user.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{user.username}</p>
                          <p className="ov-data text-[10px] text-muted-foreground">{t("mod_panel.bans.table.id", "ID:")} {user.id}</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => inviteMutation.mutate(user.id)}
                        disabled={inviteMutation.isPending}
                      >
                        {t("common.confirm")}
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {inviteSearchQuery.length >= 2 && inviteSearchResults?.length === 0 && !invitingSearch && (
                <p className="text-sm text-center text-muted-foreground py-4">
                  {t("communities_feed.no_results")}
                </p>
              )}

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center">
                  <span className="ov-label bg-background px-2">
                    {t("mod_panel.staff.add_dialog.or_by_id")}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Input
                  placeholder={t("mod_panel.staff.add_dialog.manual_id")}
                  value={inviteUserId}
                  onChange={(e) => setInviteUserId(e.target.value)}
                />
                <Button 
                  className="w-full" 
                  variant="outline"
                  disabled={!inviteUserId || inviteMutation.isPending}
                  onClick={() => inviteMutation.mutate(parseInt(inviteUserId))}
                >
                  {t("common.confirm")}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setInviteDialogOpen(false)}>
                {t("mod_panel.staff.add_dialog.cancel")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="ov-panel">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="ov-label">{t("mod_panel.members.table.user")}</TableHead>
              <TableHead className="ov-label">{t("mod_panel.members.table.role")}</TableHead>
              <TableHead className="ov-label text-right">{t("mod_panel.members.table.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center">
                  <Spinner className="mx-auto" />
                </TableCell>
              </TableRow>
            ) : filteredMembers.length === 0 && filteredBans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center p-0">
                  <EmptyState title={t("mod_panel.members.table.empty")} />
                </TableCell>
              </TableRow>
            ) : (
              <>
                {filteredMembers.map((member) => {
                  const isSelf = currentUser?.id === member.user.id;
                  const name = member.user.username;
                  const moderatable = !isSelf && canModerate(member.role);
                  const rolesEditable = !isSelf && canChangeRoles;
                  return (
                    <TableRow key={`m-${member.id}`}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span className="flex items-center gap-1">
                            {name}
                            {member.role === "owner" && <Crown className="h-3 w-3 text-star fill-star" />}
                            {isSelf && <span className="text-xs font-normal text-muted-foreground">({t("mod_panel.members.you", "you")})</span>}
                          </span>
                          <span className="ov-data text-[10px] text-muted-foreground">{t("mod_panel.bans.table.id", "ID:")} {member.user.id}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={member.role === "member" ? "secondary" : "default"} className="flex items-center gap-1 w-fit">
                          {member.role === "owner" && <Crown className="h-2.5 w-2.5" />}
                          {roleLabel(member.role)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" aria-label={t("mod_panel.members.actions_for", { name, defaultValue: "Actions for {{name}}" })}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-60">
                            <DropdownMenuLabel className="truncate">{name}</DropdownMenuLabel>
                            <DropdownMenuItem asChild>
                              <Link href={`/users/${encodeURIComponent(name)}`}>
                                <UserRound className="mr-2 h-4 w-4" />
                                {t("mod_panel.members.view_profile", "View profile")}
                              </Link>
                            </DropdownMenuItem>
                            {rolesEditable && member.role !== "owner" && (
                              <>
                                <DropdownMenuSeparator />
                                {member.role === "member" ? (
                                  <DropdownMenuItem onSelect={() => updateRoleMutation.mutate({ userId: member.user.id, role: "moderator" })}>
                                    <ShieldCheck className="mr-2 h-4 w-4" />
                                    {t("mod_panel.members.promote_mod")}
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem onSelect={() => updateRoleMutation.mutate({ userId: member.user.id, role: "member" })}>
                                    <ShieldOff className="mr-2 h-4 w-4" />
                                    {t("mod_panel.members.demote_member")}
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onSelect={() => setPending({ kind: "owner", userId: member.user.id, name })}>
                                  <Crown className="mr-2 h-4 w-4" />
                                  {t("mod_panel.members.promote_owner")}
                                </DropdownMenuItem>
                              </>
                            )}
                            {rolesEditable && member.role === "owner" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={() => updateRoleMutation.mutate({ userId: member.user.id, role: "moderator" })}>
                                  <ShieldCheck className="mr-2 h-4 w-4" />
                                  {t("mod_panel.members.make_mod", "Make moderator")}
                                </DropdownMenuItem>
                              </>
                            )}
                            {moderatable && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={() => setPending({ kind: "kick", userId: member.user.id, name })}>
                                  <UserMinus className="mr-2 h-4 w-4" />
                                  {t("mod_panel.members.kick", "Remove from community")}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onSelect={() => setPending({ kind: "ban", userId: member.user.id, name })}
                                >
                                  <Ban className="mr-2 h-4 w-4" />
                                  {t("mod_panel.members.ban", "Ban …")}
                                </DropdownMenuItem>
                              </>
                            )}
                            {!isSelf && !moderatable && !rolesEditable && (
                              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                                {t("mod_panel.members.no_rights", "You can't change anything else for this person.")}
                              </p>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredBans.map((ban) => (
                  <TableRow key={`b-${ban.id}`} className="opacity-80">
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span>{ban.user.username}</span>
                        <span className="text-xs text-muted-foreground">
                          {t("mod_panel.members.banned_since", { date: new Date(ban.bannedAt).toLocaleDateString(i18n.resolvedLanguage), defaultValue: "Banned since {{date}}" })}
                          {ban.reason ? ` · ${ban.reason}` : ""}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                        <Ban className="h-2.5 w-2.5" />
                        {t("mod_panel.roles.banned", "Banned")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" aria-label={t("mod_panel.members.actions_for", { name: ban.user.username, defaultValue: "Actions for {{name}}" })}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-60">
                          <DropdownMenuLabel className="truncate">{ban.user.username}</DropdownMenuLabel>
                          <DropdownMenuItem asChild>
                            <Link href={`/users/${encodeURIComponent(ban.user.username)}`}>
                              <UserRound className="mr-2 h-4 w-4" />
                              {t("mod_panel.members.view_profile", "View profile")}
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => setPending({ kind: "unban", userId: ban.userId, name: ban.user.username })}>
                            <Undo2 className="mr-2 h-4 w-4" />
                            {t("mod_panel.members.unban", "Lift ban")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Confirmation dialogs for the action picked in a member's menu */}
      <AlertDialog open={pending?.kind === "kick"} onOpenChange={(open) => !open && closeDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("mod_panel.members.kick_dialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("mod_panel.members.kick_dialog.desc", { name: pending?.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("mod_panel.members.kick_dialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                if (pending) kickMutation.mutate(pending.userId);
              }}
            >
              {t("mod_panel.members.kick_dialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={pending?.kind === "ban"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("mod_panel.members.ban_dialog_title", { name: pending?.name, defaultValue: "Ban {{name}}?" })}</DialogTitle>
            <DialogDescription>{t("mod_panel.members.ban_dialog_desc", "They will be removed from the community and can't join again until you lift the ban.")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="ban-reason">{t("mod_panel.bans.ban_dialog.reason_label")}</Label>
            <Input
              id="ban-reason"
              placeholder={t("mod_panel.bans.ban_dialog.reason_placeholder")}
              value={banReason}
              maxLength={500}
              onChange={(e) => setBanReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              {t("mod_panel.bans.ban_dialog.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => pending && banMutation.mutate({ userId: pending.userId, reason: banReason })}
            >
              {banMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("mod_panel.bans.ban_dialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pending?.kind === "unban"} onOpenChange={(open) => !open && closeDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("mod_panel.bans.unban_dialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("mod_panel.bans.unban_dialog.desc", { name: pending?.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("mod_panel.bans.unban_dialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                if (pending) unbanMutation.mutate(pending.userId);
              }}
            >
              {t("mod_panel.bans.unban_dialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pending?.kind === "owner"} onOpenChange={(open) => !open && closeDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("mod_panel.members.confirm_owner_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("mod_panel.members.confirm_owner_desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                if (pending) updateRoleMutation.mutate({ userId: pending.userId, role: "owner" });
              }}
            >
              {t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ModeratorsManager({ communityId }: { communityId: number }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [modUserId, setModUserId] = useState("");
  const [modUsername, setModUsername] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [modDialogOpen, setModDialogOpen] = useState(false);

  const { data: members, isLoading } = useQuery<any[]>({
    queryKey: ["/api/communities", communityId, "members"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/communities/${communityId}/members`);
      return res.json();
    },
  });

  const { data: searchResults, isLoading: searching } = useQuery<User[]>({
    queryKey: ["/api/users/search", searchQuery],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) return [];
      const res = await apiRequest("GET", `/api/users/search?q=${encodeURIComponent(searchQuery)}`);
      return res.json();
    },
    enabled: searchQuery.length >= 2,
  });

  const mods = members?.filter((m) => m.role === "moderator" || m.role === "owner") || [];

  const addModMutation = useMutation({
    mutationFn: async (userId: number) => {
      await apiRequest("POST", `/api/communities/${communityId}/moderators`, {
        userId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/communities", communityId, "members"] });
      setModUserId("");
      setModUsername("");
      setSearchQuery("");
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

  const demoteMutation = useMutation({
    mutationFn: async (userId: number) => {
      await apiRequest("PATCH", `/api/communities/${communityId}/members/${userId}/role`, {
        role: "member",
      });
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

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-display text-lg font-semibold">{t("mod_panel.staff.title")}</h3>
        <Dialog open={modDialogOpen} onOpenChange={setModDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" /> {t("mod_panel.staff.add_button")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("mod_panel.staff.add_dialog.title")}</DialogTitle>
              <DialogDescription>{t("mod_panel.staff.add_dialog.desc")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t("mod_panel.staff.add_dialog.user_id_label")}</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("admin.users_table.search_placeholder")}
                    className="pl-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {searching && (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {searchResults && searchResults.length > 0 && (
                <div className="rounded-md border divide-y max-h-48 overflow-y-auto">
                  {searchResults.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="ov-avatar h-8 w-8 bg-primary/10 flex items-center justify-center font-semibold text-xs text-primary">
                          {user.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{user.username}</p>
                          <p className="ov-data text-[10px] text-muted-foreground">{t("mod_panel.bans.table.id", "ID:")} {user.id}</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => addModMutation.mutate(user.id)}
                        disabled={addModMutation.isPending}
                      >
                        {t("mod_panel.staff.add_dialog.confirm")}
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {searchQuery.length >= 2 && searchResults?.length === 0 && !searching && (
                <p className="text-sm text-center text-muted-foreground py-4">
                  {t("communities_feed.no_results")}
                </p>
              )}

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center">
                  <span className="ov-label bg-background px-2">
                    {t("mod_panel.staff.add_dialog.or_by_id")}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Input
                  placeholder={t("mod_panel.staff.add_dialog.manual_id")}
                  value={modUserId}
                  onChange={(e) => setModUserId(e.target.value)}
                />
                <Button 
                  className="w-full" 
                  variant="outline"
                  disabled={!modUserId || addModMutation.isPending}
                  onClick={() => addModMutation.mutate(parseInt(modUserId))}
                >
                  {t("mod_panel.staff.add_dialog.confirm")}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setModDialogOpen(false)}>
                {t("mod_panel.staff.add_dialog.cancel")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="ov-panel">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="ov-label">{t("mod_panel.members.table.user")}</TableHead>
              <TableHead className="ov-label">{t("mod_panel.members.table.role")}</TableHead>
              <TableHead className="ov-label text-right">{t("mod_panel.members.table.actions")}</TableHead>
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
                    <Badge variant="secondary">{t(`mod_panel.roles.${mod.role}`, String(mod.role))}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {mod.role !== "owner" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => {
                          if (window.confirm(t("mod_panel.members.kick_dialog.desc", { name: mod.user.username }))) {
                            demoteMutation.mutate(mod.user.id);
                          }
                        }}
                        disabled={demoteMutation.isPending}
                      >
                        {demoteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
                      </Button>
                    )}
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
      <div className="ov-panel">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="ov-label">{t("mod_panel.requests.table.user")}</TableHead>
              <TableHead className="ov-label">{t("mod_panel.requests.table.date")}</TableHead>
              <TableHead className="ov-label text-right">{t("mod_panel.requests.table.actions")}</TableHead>
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
                    description={t("mod_panel.requests.empty_desc", "When users request to join this private community, they will appear here.")} 
                  />
                </TableCell>
              </TableRow>
            ) : (
              requests?.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                       <div className="ov-avatar h-6 w-6 bg-primary/10 flex items-center justify-center">
                        <span className="text-[10px] font-semibold text-primary">
                          {request.user?.username?.charAt(0).toUpperCase() || "?"}
                        </span>
                      </div>
                      {request.user?.username || t("mod_panel.requests.unknown_user", "Unknown user")}
                    </div>
                  </TableCell>
                  <TableCell className="ov-data">{new Date(request.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => approveMutation.mutate(request.userId)}
                        disabled={approveMutation.isPending}
                      >
                        <CheckCircle2 className="h-4 w-4 text-primary" />
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

