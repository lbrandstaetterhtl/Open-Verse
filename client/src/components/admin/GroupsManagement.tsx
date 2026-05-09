
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
    Shield, 
    Plus, 
    Pencil, 
    Trash2, 
    Check, 
    X,
    Lock,
    Settings,
    Users,
    Flag,
    Ticket,
    Activity,
    AlertTriangle,
    Award,
    BarChart3
} from "lucide-react";
import { 
    Card, 
    CardContent, 
    CardDescription, 
    CardHeader, 
    CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogFooter,
    DialogTrigger 
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const AVAILABLE_PERMISSIONS = [
    { id: "dashboard", label: "Dashboard Access", icon: Activity, description: "View admin overview and statistics" },
    { id: "users", label: "User Management", icon: Users, description: "Manage roles, verification, and profile data" },
    { id: "reports", label: "Content Moderation", icon: Flag, description: "Handle reports and resolve content disputes" },
    { id: "groups", label: "Group Management", icon: Shield, description: "Edit admin groups and permissions" },
    { id: "security", label: "Security & Bans", icon: Lock, description: "Access ban system and security tools" },
    { id: "auto_punishment", label: "Auto-Punishment", icon: Activity, description: "Manage automated rule enforcement systems" },
    { id: "logs", label: "Activity Monitoring", icon: Activity, description: "View system logs and anomaly reports" },
    { id: "analytics", label: "Platform Analytics", icon: BarChart3, description: "View growth charts and usage metrics" },
    { id: "performance", label: "Moderator Performance", icon: Award, description: "Track moderation efficiency and stats" },
    { id: "tickets", label: "Support Tickets", icon: Ticket, description: "Manage and resolve user support tickets" },
    { id: "stress_test", label: "Stress Testing", icon: AlertTriangle, description: "Run system stress tests and performance audits" },
    { id: "settings", label: "System Settings", icon: Settings, description: "Configure global platform parameters" },
];

export function GroupsManagement() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editingGroup, setEditingGroup] = useState<any>(null);
    const [viewingMembers, setViewingMembers] = useState<any>(null);

    const { data: groups, isLoading } = useQuery<any[]>({
        queryKey: ["/api/admin/groups"],
    });

    const { data: users } = useQuery<any[]>({
        queryKey: ["/api/admin/users"],
    });

    const createMutation = useMutation({
        mutationFn: async (data: any) => {
            const res = await apiRequest("POST", "/api/admin/groups", data);
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/groups"] });
            setIsCreateOpen(false);
            toast({ title: "Success", description: "Admin group created." });
        }
    });

    const updateMutation = useMutation({
        mutationFn: async ({ id, data }: { id: number, data: any }) => {
            const res = await apiRequest("PATCH", `/api/admin/groups/${id}`, data);
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/groups"] });
            setEditingGroup(null);
            toast({ title: "Success", description: "Admin group updated." });
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: number) => {
            await apiRequest("DELETE", `/api/admin/groups/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/groups"] });
            toast({ title: "Success", description: "Admin group deleted." });
        }
    });

    const getGroupMembers = (groupId: number) => {
        return users?.filter(u => u.adminGroupId === groupId) || [];
    };

    if (isLoading) {
        return <div className="p-8 text-center opacity-50">Loading groups...</div>;
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-2xl font-black italic uppercase tracking-tight">Admin Groups</h3>
                    <p className="text-sm text-muted-foreground">Manage administrative roles and their granular access permissions.</p>
                </div>
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogTrigger asChild>
                        <Button className="rounded-full gap-2 shadow-xl shadow-primary/20">
                            <Plus className="h-4 w-4" />
                            Create Group
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="glass-premium border-white/10 max-w-2xl">
                        <GroupForm 
                            title="Create Admin Group" 
                            onSubmit={(data: any) => createMutation.mutate(data)} 
                            onCancel={() => setIsCreateOpen(false)}
                            isLoading={createMutation.isPending}
                        />
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {groups?.map((group) => {
                    const members = getGroupMembers(group.id);
                    return (
                        <Card key={group.id} className="glass-premium border-white/5 group relative overflow-hidden transition-all hover:-translate-y-1">
                            <div 
                                className="absolute top-0 left-0 w-1 h-full opacity-60" 
                                style={{ backgroundColor: group.color || '#3b82f6' }} 
                            />
                            <CardHeader className="pb-4">
                                <div className="flex items-center justify-between mb-2">
                                    <Badge 
                                        className="rounded-full text-[10px] font-black uppercase tracking-widest px-3"
                                        style={{ backgroundColor: `${group.color}20`, color: group.color, border: `1px solid ${group.color}40` }}
                                    >
                                        Group ID: {group.id}
                                    </Badge>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setEditingGroup(group)}>
                                            <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-8 w-8 rounded-full text-red-500 hover:text-red-500 hover:bg-red-500/10"
                                            onClick={() => {
                                                if (confirm("Are you sure you want to delete this group?")) {
                                                    deleteMutation.mutate(group.id);
                                                }
                                            }}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                                <CardTitle className="text-xl font-black italic uppercase tracking-tight">{group.name}</CardTitle>
                                <CardDescription className="line-clamp-2 text-xs leading-relaxed">{group.description}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    <div>
                                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2 block">Active Permissions</span>
                                        <div className="flex flex-wrap gap-1.5">
                                            {(() => {
                                                const perms = typeof group.permissions === 'string' ? JSON.parse(group.permissions) : group.permissions;
                                                return Array.isArray(perms) ? perms.map(p => (
                                                    <Badge key={p} variant="secondary" className="text-[9px] font-bold bg-white/5 border-white/5">
                                                        {p.toUpperCase()}
                                                    </Badge>
                                                )) : null;
                                            })()}
                                        </div>
                                    </div>
                                    
                                    <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                                        <div className="flex -space-x-2">
                                            {members.slice(0, 3).map((m, i) => (
                                                <div key={i} className="h-6 w-6 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[8px] font-black uppercase shadow-sm">
                                                    {m.username[0].toUpperCase()}
                                                </div>
                                            ))}
                                            {members.length > 3 && (
                                                <div className="h-6 w-6 rounded-full border-2 border-background bg-primary/20 text-primary flex items-center justify-center text-[8px] font-black shadow-sm">
                                                    +{members.length - 3}
                                                </div>
                                            )}
                                            {members.length === 0 && (
                                                <span className="text-[9px] text-muted-foreground italic">No members yet</span>
                                            )}
                                        </div>
                                        <Button 
                                            variant="link" 
                                            size="sm" 
                                            className="h-auto p-0 text-[10px] font-black uppercase tracking-widest text-primary hover:no-underline"
                                            onClick={() => setViewingMembers({ group, members })}
                                            disabled={members.length === 0}
                                        >
                                            View {members.length} {members.length === 1 ? 'Member' : 'Members'}
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            <Dialog open={!!editingGroup} onOpenChange={(open) => !open && setEditingGroup(null)}>
                <DialogContent className="glass-premium border-white/10 max-w-2xl">
                    {editingGroup && (
                        <GroupForm 
                            title="Edit Admin Group" 
                            initialData={editingGroup}
                            onSubmit={(data: any) => updateMutation.mutate({ id: editingGroup.id, data })} 
                            onCancel={() => setEditingGroup(null)}
                            isLoading={updateMutation.isPending}
                        />
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={!!viewingMembers} onOpenChange={(open) => !open && setViewingMembers(null)}>
                <DialogContent className="glass-premium border-white/10 max-w-md">
                    {viewingMembers && (
                        <div className="space-y-6 py-4">
                            <DialogHeader>
                                <DialogTitle className="text-2xl font-black italic uppercase tracking-tight flex items-center gap-3">
                                    <div className="h-3 w-3 rounded-full shadow-[0_0_10px_rgba(var(--primary),0.5)]" style={{ backgroundColor: viewingMembers.group.color }} />
                                    {viewingMembers.group.name} Members
                                </DialogTitle>
                                <CardDescription>List of administrators assigned to this permission group.</CardDescription>
                            </DialogHeader>
                            
                            <div className="max-h-[400px] overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                                {viewingMembers.members.map((m: any) => (
                                    <div key={m.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors group">
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-black text-xs shadow-inner">
                                                {m.username[0].toUpperCase()}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold">{m.username}</span>
                                                <span className="text-[9px] font-mono text-muted-foreground uppercase">{m.role}</span>
                                            </div>
                                        </div>
                                        <Badge variant="outline" className="text-[9px] font-black opacity-50 group-hover:opacity-100 transition-opacity">ID: {m.id}</Badge>
                                    </div>
                                ))}
                            </div>

                            <DialogFooter>
                                <Button onClick={() => setViewingMembers(null)} className="rounded-full w-full shadow-lg">Close</Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function GroupForm({ title, initialData, onSubmit, onCancel, isLoading }: any) {
    const [name, setName] = useState(initialData?.name || "");
    const [description, setDescription] = useState(initialData?.description || "");
    const [color, setColor] = useState(initialData?.color || "#3b82f6");
    const [permissions, setPermissions] = useState<string[]>(() => {
        if (!initialData?.permissions) return [];
        return typeof initialData.permissions === 'string' ? JSON.parse(initialData.permissions) : initialData.permissions;
    });

    const togglePermission = (id: string) => {
        setPermissions(prev => 
            prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
        );
    };

    return (
        <div className="space-y-6 py-4">
            <DialogHeader>
                <DialogTitle className="text-2xl font-black italic uppercase tracking-tight">{title}</DialogTitle>
            </DialogHeader>
            
            <div className="grid gap-6">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest opacity-60">Group Name</Label>
                        <Input 
                            value={name} 
                            onChange={(e) => setName(e.target.value)} 
                            placeholder="e.g. Content Moderator" 
                            className="glass-input h-11 font-bold"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest opacity-60">Accent Color</Label>
                        <div className="flex gap-2">
                            <Input 
                                type="color"
                                value={color} 
                                onChange={(e) => setColor(e.target.value)} 
                                className="h-11 w-11 p-1 bg-transparent border-white/10 rounded-lg cursor-pointer"
                            />
                            <Input 
                                value={color} 
                                onChange={(e) => setColor(e.target.value)} 
                                className="glass-input h-11 font-mono uppercase text-xs"
                            />
                        </div>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest opacity-60">Description</Label>
                    <Input 
                        value={description} 
                        onChange={(e) => setDescription(e.target.value)} 
                        placeholder="What is this group responsible for?" 
                        className="glass-input h-11"
                    />
                </div>

                <div className="space-y-4">
                    <Label className="text-[10px] font-black uppercase tracking-widest opacity-60">Granular Permissions</Label>
                    <div className="grid grid-cols-2 gap-3">
                        {AVAILABLE_PERMISSIONS.map((perm) => (
                            <div 
                                key={perm.id}
                                className={cn(
                                    "flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer select-none",
                                    permissions.includes(perm.id) 
                                        ? "bg-primary/10 border-primary/40 shadow-inner" 
                                        : "bg-white/5 border-white/5 hover:border-white/10"
                                )}
                                onClick={() => togglePermission(perm.id)}
                            >
                                <div className={cn(
                                    "h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm",
                                    permissions.includes(perm.id) ? "bg-primary text-primary-foreground" : "bg-white/5 text-muted-foreground"
                                )}>
                                    <perm.icon className="h-4 w-4" />
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-black uppercase tracking-tight">{perm.label}</span>
                                        <Checkbox checked={permissions.includes(perm.id)} className="h-4 w-4 rounded-md" />
                                    </div>
                                    <p className="text-[9px] text-muted-foreground leading-tight">{perm.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <DialogFooter className="pt-6">
                <Button variant="ghost" onClick={onCancel} className="rounded-full px-8">Cancel</Button>
                <Button 
                    className="rounded-full px-8 shadow-xl shadow-primary/20"
                    disabled={isLoading || !name}
                    onClick={() => onSubmit({ 
                        name, 
                        description, 
                        color, 
                        permissions: JSON.stringify(permissions) 
                    })}
                >
                    {isLoading ? "Saving..." : "Save Group"}
                </Button>
            </DialogFooter>
        </div>
    );
}
