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
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, MoreHorizontal, Shield, Ban, CheckCircle, XCircle, AlertTriangle, Search, UserPlus, Trash2, Flag, Eye, UserMinus } from "lucide-react";
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

export default function ModPanel() {
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
                    Moderator Panel
                </h1>

                {isLoadingCommunities ? (
                    <SkeletonLoader />
                ) : !communities || communities.length === 0 ? (
                    <Card>
                        <CardContent className="pt-6 text-center text-muted-foreground">
                            You are not moderating any communities.
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        {/* Sidebar for Community Selection */}
                        <div className="md:col-span-1 space-y-2">
                            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">My Communities</h2>
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
                            {selectedCommunityId && (
                                <ModContext communityId={parseInt(selectedCommunityId)} />
                            )}
                        </div>
                    </div>
                )}
            </main>
        </>
    );
}

function ModContext({ communityId }: { communityId: number }) {
    return (
        <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="files">Reports</TabsTrigger>
                <TabsTrigger value="members">Members</TabsTrigger>
                <TabsTrigger value="bans">Bans</TabsTrigger>
                <TabsTrigger value="moderators">Staff</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
                <Card>
                    <CardHeader>
                        <CardTitle>Community Overview</CardTitle>
                        <CardDescription>Metrics and quick actions (Coming Soon)</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground">Select a tab to manage your community.</p>
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="files">
                <ReportsManager communityId={communityId} />
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
    const { toast } = useToast();
    const [filterStatus, setFilterStatus] = useState<string>("all");

    const { data: reports, isLoading } = useQuery<Report[]>({
        queryKey: ["/api/communities", communityId, "reports"],
        queryFn: async () => {
            const res = await apiRequest("GET", `/api/communities/${communityId}/reports`);
            return res.json();
        }
    });

    const updateReportMutation = useMutation({
        mutationFn: async ({ id, status }: { id: number, status: string }) => {
            await apiRequest("PATCH", `/api/communities/${communityId}/reports/${id}`, { status });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/communities", communityId, "reports"] });
            toast({ title: "Report Updated", description: "The report status has been updated." });
        },
        onError: (err: Error) => {
            toast({ title: "Error", description: err.message, variant: "destructive" });
        }
    });

    const filteredReports = reports?.filter(r => filterStatus === "all" || r.status === filterStatus) || [];

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div className="w-64">
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                        <SelectTrigger>
                            <SelectValue placeholder="Filter by status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Reports</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="resolved">Resolved</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Type</TableHead>
                            <TableHead>Reason</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                                </TableCell>
                            </TableRow>
                        ) : filteredReports.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                    No reports found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredReports.map((report) => (
                                <TableRow key={report.id}>
                                    <TableCell>
                                        {report.postId ? <Badge variant="outline">Post</Badge> :
                                            report.commentId ? <Badge variant="outline">Comment</Badge> :
                                                <Badge variant="outline">Other</Badge>}
                                    </TableCell>
                                    <TableCell>{report.reason}</TableCell>
                                    <TableCell>
                                        <Badge variant={
                                            report.status === "pending" ? "destructive" :
                                                report.status === "resolved" ? "default" : "secondary"
                                        }>
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
                                                        onClick={() => updateReportMutation.mutate({ id: report.id, status: "resolved" })}
                                                        disabled={updateReportMutation.isPending}
                                                    >
                                                        <CheckCircle className="h-4 w-4 text-green-500" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => updateReportMutation.mutate({ id: report.id, status: "rejected" })}
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
            toast({ title: "User Kicked", description: "Member removed from community." });
        },
        onError: (err: Error) => {
            toast({ title: "Error", description: err.message, variant: "destructive" });
        }
    });

    const filteredMembers = members?.filter(m =>
        m.user.username.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div className="relative w-72">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search members..."
                        className="pl-8"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>User</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={3} className="h-24 text-center">
                                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                                </TableCell>
                            </TableRow>
                        ) : filteredMembers.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                                    No members found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredMembers.map((member) => (
                                <TableRow key={member.id}>
                                    <TableCell className="font-medium">{member.user.username}</TableCell>
                                    <TableCell>
                                        <Badge variant={member.role === 'member' ? 'secondary' : 'default'}>
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
                                                            <AlertDialogTitle>Kick Member?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                Are you sure you want to remove {member.user.username} from the community? They can join again later.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction
                                                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                                onClick={() => kickMutation.mutate(member.user.id)}
                                                            >
                                                                Kick User
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
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
        }
    });

    const banMutation = useMutation({
        mutationFn: async () => {
            await apiRequest("POST", `/api/communities/${communityId}/ban`, {
                userId: parseInt(banUserId),
                reason: banReason
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/communities", communityId, "bans"] });
            setBanUserId("");
            setBanReason("");
            setBanDialogOpen(false);
            toast({ title: "User Banned", description: "The user has been banned from the community." });
        },
        onError: (err: Error) => {
            toast({ title: "Error", description: err.message, variant: "destructive" });
        }
    });

    const unbanMutation = useMutation({
        mutationFn: async (userId: number) => {
            await apiRequest("DELETE", `/api/communities/${communityId}/ban/${userId}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/communities", communityId, "bans"] });
            toast({ title: "User Unbanned", description: "Access restored." });
        },
    });

    const filteredBans = bans?.filter(b =>
        b.user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.userId.toString().includes(searchTerm)
    ) || [];

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div className="relative w-72">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search bans..."
                        className="pl-8"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                <Dialog open={banDialogOpen} onOpenChange={setBanDialogOpen}>
                    <DialogTrigger asChild>
                        <Button variant="destructive"><Ban className="mr-2 h-4 w-4" /> Ban User</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Ban User from Community</DialogTitle>
                            <DialogDescription>
                                Prevent a user from posting or commenting in this community.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>User ID</Label>
                                <Input
                                    placeholder="Target User ID"
                                    value={banUserId}
                                    onChange={e => setBanUserId(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Reason</Label>
                                <Input
                                    placeholder="Reason for ban"
                                    value={banReason}
                                    onChange={e => setBanReason(e.target.value)}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setBanDialogOpen(false)}>Cancel</Button>
                            <Button
                                variant="destructive"
                                onClick={() => banMutation.mutate()}
                                disabled={!banUserId || banMutation.isPending}
                            >
                                {banMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Ban User
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>User</TableHead>
                            <TableHead>Reason</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={4} className="h-24 text-center">
                                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                                </TableCell>
                            </TableRow>
                        ) : filteredBans.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                    No bans found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredBans.map((ban) => (
                                <TableRow key={ban.id}>
                                    <TableCell>
                                        <div className="font-medium">{ban.user.username}</div>
                                        <div className="text-xs text-muted-foreground">ID: {ban.userId}</div>
                                    </TableCell>
                                    <TableCell>{ban.reason || "No reason"}</TableCell>
                                    <TableCell>{new Date(ban.bannedAt).toLocaleDateString()}</TableCell>
                                    <TableCell className="text-right">
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="ghost" size="icon">
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Unban User?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This will restore access for {ban.user.username} to the community.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => unbanMutation.mutate(ban.userId)}>
                                                        Unban
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
    const { toast } = useToast();
    const [modUserId, setModUserId] = useState("");
    const [modDialogOpen, setModDialogOpen] = useState(false);

    const { data: members, isLoading } = useQuery<any[]>({
        queryKey: ["/api/communities", communityId, "members"],
        queryFn: async () => {
            const res = await apiRequest("GET", `/api/communities/${communityId}/members`);
            return res.json();
        }
    });

    const mods = members?.filter(m => m.role === 'moderator' || m.role === 'owner') || [];

    const addModMutation = useMutation({
        mutationFn: async () => {
            await apiRequest("POST", `/api/communities/${communityId}/moderators`, {
                userId: parseInt(modUserId)
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/communities", communityId, "members"] });
            setModUserId("");
            setModDialogOpen(false);
            toast({ title: "Moderator Added", description: "User promoted to moderator." });
        },
        onError: (err: Error) => {
            toast({ title: "Error", description: err.message, variant: "destructive" });
        }
    });

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Community Staff</h3>
                <Dialog open={modDialogOpen} onOpenChange={setModDialogOpen}>
                    <DialogTrigger asChild>
                        <Button><UserPlus className="mr-2 h-4 w-4" /> Add Moderator</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Add Moderator</DialogTitle>
                            <DialogDescription>
                                Grant moderation privileges. Only the Owner can do this.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>User ID</Label>
                                <Input
                                    placeholder="Target User ID"
                                    value={modUserId}
                                    onChange={e => setModUserId(e.target.value)}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setModDialogOpen(false)}>Cancel</Button>
                            <Button
                                onClick={() => addModMutation.mutate()}
                                disabled={!modUserId || addModMutation.isPending}
                            >
                                {addModMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Add Moderator
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>User</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={3} className="h-24 text-center">
                                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                                </TableCell>
                            </TableRow>
                        ) : (
                            mods.map((mod) => (
                                <TableRow key={mod.id}>
                                    <TableCell className="font-medium">{mod.user.username}</TableCell>
                                    <TableCell>
                                        <Badge variant="secondary">{mod.role.toUpperCase()}</Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {/* Future: Remove Mod action */}
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
