
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
import { useTranslation } from "react-i18next";

const AVAILABLE_PERMISSIONS = [
    { id: "dashboard", labelKey: "admin_groups.permissions.dashboard.label", label: "Dashboard Access", descriptionKey: "admin_groups.permissions.dashboard.description", icon: Activity, description: "View admin overview and statistics" },
    { id: "users", labelKey: "admin_groups.permissions.users.label", label: "User Management", descriptionKey: "admin_groups.permissions.users.description", icon: Users, description: "Manage roles, verification, and profile data" },
    { id: "reports", labelKey: "admin_groups.permissions.reports.label", label: "Content Moderation", descriptionKey: "admin_groups.permissions.reports.description", icon: Flag, description: "Handle reports and resolve content disputes" },
    { id: "groups", labelKey: "admin_groups.permissions.groups.label", label: "Group Management", descriptionKey: "admin_groups.permissions.groups.description", icon: Shield, description: "Edit admin groups and permissions" },
    { id: "security", labelKey: "admin_groups.permissions.security.label", label: "Security & Bans", descriptionKey: "admin_groups.permissions.security.description", icon: Lock, description: "Access ban system and security tools" },
    { id: "auto_punishment", labelKey: "admin_groups.permissions.auto_punishment.label", label: "Auto-Punishment", descriptionKey: "admin_groups.permissions.auto_punishment.description", icon: Activity, description: "Manage automated rule enforcement systems" },
    { id: "logs", labelKey: "admin_groups.permissions.logs.label", label: "Activity Monitoring", descriptionKey: "admin_groups.permissions.logs.description", icon: Activity, description: "View system logs and anomaly reports" },
    { id: "analytics", labelKey: "admin_groups.permissions.analytics.label", label: "Platform Analytics", descriptionKey: "admin_groups.permissions.analytics.description", icon: BarChart3, description: "View growth charts and usage metrics" },
    { id: "performance", labelKey: "admin_groups.permissions.performance.label", label: "Moderator Performance", descriptionKey: "admin_groups.permissions.performance.description", icon: Award, description: "Track moderation efficiency and stats" },
    { id: "tickets", labelKey: "admin_groups.permissions.tickets.label", label: "Support Tickets", descriptionKey: "admin_groups.permissions.tickets.description", icon: Ticket, description: "Manage and resolve user support tickets" },
    { id: "stress_test", labelKey: "admin_groups.permissions.stress_test.label", label: "Stress Testing", descriptionKey: "admin_groups.permissions.stress_test.description", icon: AlertTriangle, description: "Run system stress tests and performance audits" },
    { id: "settings", labelKey: "admin_groups.permissions.settings.label", label: "System Settings", descriptionKey: "admin_groups.permissions.settings.description", icon: Settings, description: "Configure global platform parameters" },
];

export function GroupsManagement() {
    const { t } = useTranslation();
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
            toast({ title: t("admin_groups.toast.success", "Success"), description: t("admin_groups.toast.created", "Admin group created.") });
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
            toast({ title: t("admin_groups.toast.success", "Success"), description: t("admin_groups.toast.updated", "Admin group updated.") });
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: number) => {
            await apiRequest("DELETE", `/api/admin/groups/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/groups"] });
            toast({ title: t("admin_groups.toast.success", "Success"), description: t("admin_groups.toast.deleted", "Admin group deleted.") });
        }
    });

    const getGroupMembers = (groupId: number) => {
        return users?.filter(u => u.adminGroupId === groupId) || [];
    };

    if (isLoading) {
        return <div className="p-8 text-center opacity-50">{t("admin_groups.loading", "Loading groups...")}</div>;
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-display text-xl font-semibold">{t("admin_groups.title", "Admin groups")}</h3>
                    <p className="text-sm text-muted-foreground">{t("admin_groups.description", "Manage administrative roles and their granular access permissions.")}</p>
                </div>
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="h-4 w-4" />
                            {t("admin_groups.create", "Create group")}
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                        <GroupForm 
                            title={t("admin_groups.form.create_title", "Create admin group")} 
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
                        <Card key={group.id} className="ov-panel-hover group overflow-hidden">
                            <div 
                                className="absolute top-0 left-0 w-1 h-full opacity-60" 
                                style={{ backgroundColor: group.color || 'hsl(var(--primary))' }} 
                            />
                            <CardHeader className="pb-4">
                                <div className="flex items-center justify-between mb-2">
                                    <Badge 
                                        className="font-data font-medium"
                                        style={{ backgroundColor: `${group.color}20`, color: group.color, border: `1px solid ${group.color}40` }}
                                    >
                                        {t("admin_groups.group_id", { id: group.id, defaultValue: "Group ID: {{id}}" })}
                                    </Badge>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t("admin_groups.edit", "Edit group")} onClick={() => setEditingGroup(group)}>
                                            <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                            aria-label={t("admin_groups.delete", "Delete group")}
                                            onClick={() => {
                                                if (confirm(t("admin_groups.delete_confirm", "Are you sure you want to delete this group?"))) {
                                                    deleteMutation.mutate(group.id);
                                                }
                                            }}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                                <CardTitle>{group.name}</CardTitle>
                                <CardDescription className="line-clamp-2 text-xs leading-relaxed">{group.description}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    <div>
                                        <span className="ov-label mb-2 block">{t("admin_groups.active_permissions", "Active permissions")}</span>
                                        <div className="flex flex-wrap gap-1.5">
                                            {(() => {
                                                const perms = typeof group.permissions === 'string' ? JSON.parse(group.permissions) : group.permissions;
                                                return Array.isArray(perms) ? perms.map(p => (
                                                    <div key={p} className="ov-chip h-6 px-2 font-data text-[11px]">
                                                        {p.toUpperCase()}
                                                    </div>
                                                )) : null;
                                            })()}
                                        </div>
                                    </div>
                                    
                                    <div className="pt-4 border-t border-border flex items-center justify-between">
                                        <div className="flex items-center gap-1">
                                            {members.slice(0, 3).map((m, i) => (
                                                <div key={i} className="ov-avatar h-6 w-6 bg-muted flex items-center justify-center text-[10px] font-semibold">
                                                    {m.username[0].toUpperCase()}
                                                </div>
                                            ))}
                                            {members.length > 3 && (
                                                <div className="ov-avatar h-6 w-6 bg-primary/10 text-primary flex items-center justify-center font-data text-[10px] font-semibold">
                                                    +{members.length - 3}
                                                </div>
                                            )}
                                            {members.length === 0 && (
                                                <span className="text-xs text-muted-foreground">{t("admin_groups.no_members", "No members yet")}</span>
                                            )}
                                        </div>
                                        <Button 
                                            variant="link" 
                                            size="sm" 
                                            className="h-auto p-0 text-xs hover:no-underline"
                                            onClick={() => setViewingMembers({ group, members })}
                                            disabled={members.length === 0}
                                        >
                                            {t("admin_groups.view_members", { count: members.length, defaultValue: "View {{count}} members" })}
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            <Dialog open={!!editingGroup} onOpenChange={(open) => !open && setEditingGroup(null)}>
                <DialogContent className="max-w-2xl">
                    {editingGroup && (
                        <GroupForm 
                            title={t("admin_groups.form.edit_title", "Edit admin group")} 
                            initialData={editingGroup}
                            onSubmit={(data: any) => updateMutation.mutate({ id: editingGroup.id, data })} 
                            onCancel={() => setEditingGroup(null)}
                            isLoading={updateMutation.isPending}
                        />
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={!!viewingMembers} onOpenChange={(open) => !open && setViewingMembers(null)}>
                <DialogContent className="max-w-md">
                    {viewingMembers && (
                        <div className="space-y-6 py-4">
                            <DialogHeader>
                                <DialogTitle className="font-display text-xl font-semibold flex items-center gap-3">
                                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: viewingMembers.group.color }} />
                                    {t("admin_groups.members_dialog.title", { name: viewingMembers.group.name, defaultValue: "{{name}} members" })}
                                </DialogTitle>
                                <CardDescription>{t("admin_groups.members_dialog.description", "List of administrators assigned to this permission group.")}</CardDescription>
                            </DialogHeader>
                            
                            <div className="max-h-[400px] overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                                {viewingMembers.members.map((m: any) => (
                                    <div key={m.id} className="ov-panel flex items-center justify-between p-3 group">
                                        <div className="flex items-center gap-3">
                                            <div className="ov-avatar h-8 w-8 bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs">
                                                {m.username[0].toUpperCase()}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-semibold">{m.username}</span>
                                                <span className="ov-label">{t(`admin.roles.${m.role}`, m.role)}</span>
                                            </div>
                                        </div>
                                        <Badge variant="outline" className="font-data font-medium text-muted-foreground opacity-60 group-hover:opacity-100 transition-opacity">{t("admin_groups.members_dialog.member_id", { id: m.id, defaultValue: "ID: {{id}}" })}</Badge>
                                    </div>
                                ))}
                            </div>

                            <DialogFooter>
                                <Button onClick={() => setViewingMembers(null)} className="w-full">{t("admin_groups.members_dialog.close", "Close")}</Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function GroupForm({ title, initialData, onSubmit, onCancel, isLoading }: any) {
    const { t } = useTranslation();
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
                <DialogTitle className="font-display text-xl font-semibold">{title}</DialogTitle>
            </DialogHeader>
            
            <div className="grid gap-6">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="ov-label text-[11px]">{t("admin_groups.form.name", "Group name")}</Label>
                        <Input 
                            value={name} 
                            onChange={(e) => setName(e.target.value)} 
                            placeholder={t("admin_groups.form.name_placeholder", "e.g. Content moderator")} 
                            className="h-11 font-semibold"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="ov-label text-[11px]">{t("admin_groups.form.color", "Accent color")}</Label>
                        <div className="flex gap-2">
                            <Input 
                                type="color"
                                value={color} 
                                onChange={(e) => setColor(e.target.value)} 
                                className="h-11 w-11 p-1 bg-transparent cursor-pointer"
                            />
                            <Input 
                                value={color} 
                                onChange={(e) => setColor(e.target.value)} 
                                className="h-11 font-data text-xs"
                            />
                        </div>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label className="ov-label text-[11px]">{t("admin_groups.form.description", "Description")}</Label>
                    <Input 
                        value={description} 
                        onChange={(e) => setDescription(e.target.value)} 
                        placeholder={t("admin_groups.form.description_placeholder", "What is this group responsible for?")} 
                        className="h-11"
                    />
                </div>

                <div className="space-y-4">
                    <Label className="ov-label text-[11px]">{t("admin_groups.form.permissions", "Granular permissions")}</Label>
                    <div className="grid grid-cols-2 gap-3">
                        {AVAILABLE_PERMISSIONS.map((perm) => (
                            <div 
                                key={perm.id}
                                className={cn(
                                    "ov-panel ov-panel-hover flex items-start gap-3 p-3 cursor-pointer select-none",
                                    permissions.includes(perm.id) && "ov-panel-active"
                                )}
                                onClick={() => togglePermission(perm.id)}
                            >
                                <div className={cn(
                                    "ov-cut h-8 w-8 rounded-sm flex items-center justify-center flex-shrink-0",
                                    permissions.includes(perm.id) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                                )}>
                                    <perm.icon className="h-4 w-4" />
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-semibold">{t(perm.labelKey, perm.label)}</span>
                                        <Checkbox checked={permissions.includes(perm.id)} className="h-4 w-4" />
                                    </div>
                                    <p className="text-[11px] text-muted-foreground leading-snug">{t(perm.descriptionKey, perm.description)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <DialogFooter className="pt-6">
                <Button variant="ghost" onClick={onCancel}>{t("common.cancel", "Cancel")}</Button>
                <Button 
                    disabled={isLoading || !name}
                    onClick={() => onSubmit({ 
                        name, 
                        description, 
                        color, 
                        permissions: JSON.stringify(permissions) 
                    })}
                >
                    {isLoading ? t("admin_groups.form.saving", "Saving...") : t("admin_groups.form.save", "Save group")}
                </Button>
            </DialogFooter>
        </div>
    );
}
