import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ShieldAlert, Plus, Trash2, Power, Pencil, AlertTriangle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";

/* Severity threshold chip tint, matching the activity log severities. */
const severityChip: Record<string, string> = {
  low: "",
  medium: "ov-chip-primary",
  high: "ov-chip-star",
  critical: "ov-chip-danger",
};

export function AutoPunishmentPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = useAuth();

  if (!hasPermission("auto_punishment")) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="ov-cut h-16 w-16 bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>
        <div className="text-center">
          <h2 className="font-display text-xl font-semibold">{t("staff:admin_autopunish.access_restricted.title", "Access restricted")}</h2>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">{t("staff:admin_autopunish.access_restricted.description", "You do not have the required permissions to manage auto-punishment rules.")}</p>
        </div>
      </div>
    );
  }
  const { data, isLoading } = useQuery<{ rules: any[], executions: any[] }>({
    queryKey: ["/api/admin/auto-punishments"],
  });

  const [editId, setEditId] = useState<number | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  
  const emptyForm = {
    name: "",
    description: "",
    anomalyType: "api_abuse",
    severityThreshold: "high",
    action: "warn",
    actionReason: "",
    actionDurationHours: "",
    cooldownHours: "1",
    escalateAfterCount: "1",
    escalationWindowHours: "24",
  };
  const [formData, setFormData] = useState(emptyForm);

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (editId) {
          await apiRequest("PATCH", `/api/admin/auto-punishments/rules/${editId}`, payload);
      } else {
          await apiRequest("POST", "/api/admin/auto-punishments/rules", payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/auto-punishments"] });
      toast({ title: editId ? t("staff:admin_autopunish.toast.updated", "Rule updated successfully") : t("staff:admin_autopunish.toast.created", "Rule created successfully") });
      setIsCreateOpen(false);
      setFormData(emptyForm);
      setEditId(null);
    }
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number, isActive: boolean }) => {
      await apiRequest("PATCH", `/api/admin/auto-punishments/rules/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/auto-punishments"] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/auto-punishments/rules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/auto-punishments"] });
      toast({ title: t("staff:admin_autopunish.toast.deleted", "Rule deleted") });
    }
  });

  const handleCreate = () => {
     if (!formData.name || !formData.actionReason) {
         return toast({ title: t("staff:admin_autopunish.toast.validation_error", "Validation error"), description: t("staff:admin_autopunish.toast.validation_required", "Name and action reason are required"), variant: "destructive" });
     }
     const payload: any = {
         ...formData,
         actionDurationHours: formData.actionDurationHours ? parseInt(formData.actionDurationHours) : null,
         cooldownHours: parseInt(formData.cooldownHours) || 1,
         escalateAfterCount: parseInt(formData.escalateAfterCount) || 1,
         escalationWindowHours: parseInt(formData.escalationWindowHours) || 24,
     };
     
     if (!editId) {
         payload.isActive = 1; // Only set active status explicitly on creation
     }
     
     createMutation.mutate(payload);
  };

  const severityLabels: Record<string, string> = {
    low: t("staff:admin_autopunish.severity.low", "Low"),
    medium: t("staff:admin_autopunish.severity.medium", "Medium"),
    high: t("staff:admin_autopunish.severity.high", "High"),
    critical: t("staff:admin_autopunish.severity.critical", "Critical"),
  };

  return (
    <div className="space-y-8">
        <PageHeader
          eyebrow={t("staff:monitoring.eyebrow_moderation", "Admin / Moderation")}
          title={t("staff:admin_autopunish.title", "Auto-punishment engine")}
          description={t("staff:admin_autopunish.description", "Automated threat response and mitigation rules.")}
        />

        <Card>
          <CardHeader className="flex flex-row justify-between items-center">
            <CardTitle className="text-lg flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-primary" /> {t("staff:admin_autopunish.rules.title", "Active rules")}</CardTitle>
            <Dialog open={isCreateOpen} onOpenChange={open => { setIsCreateOpen(open); if (!open) setEditId(null); }}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={() => { setEditId(null); setFormData(emptyForm); }}><Plus className="w-4 h-4 mr-2" /> {t("staff:admin_autopunish.rules.new", "New rule")}</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{editId ? t("staff:admin_autopunish.dialog.edit_title", "Edit auto-punishment rule") : t("staff:admin_autopunish.dialog.create_title", "Create auto-punishment rule")}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                   <div className="space-y-2">
                     <Label>{t("staff:admin_autopunish.form.name", "Rule name")}</Label>
                     <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder={t("staff:admin_autopunish.form.name_placeholder", "e.g. Strict API abuser block")} />
                   </div>
                   <div className="space-y-2">
                     <Label>{t("staff:admin_autopunish.form.description", "Description")} <span className="text-muted-foreground text-xs">{t("staff:admin_autopunish.form.optional", "(optional)")}</span></Label>
                     <Input value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder={t("staff:admin_autopunish.form.description_placeholder", "What exactly does this rule prevent?")} />
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-2">
                       <Label>{t("staff:admin_autopunish.form.anomaly_trigger", "Anomaly trigger")}</Label>
                       <Select value={formData.anomalyType} onValueChange={v => setFormData({ ...formData, anomalyType: v })}>
                         <SelectTrigger><SelectValue /></SelectTrigger>
                         <SelectContent>
                           <SelectItem value="brute_force_login">{t("staff:admin_autopunish.anomaly.brute_force_login", "Brute-force login")}</SelectItem>
                           <SelectItem value="api_abuse">{t("staff:admin_autopunish.anomaly.api_abuse", "API abuse")}</SelectItem>
                           <SelectItem value="spam_content">{t("staff:admin_autopunish.anomaly.spam_content", "Spam content")}</SelectItem>
                           <SelectItem value="rapid_creation">{t("staff:admin_autopunish.anomaly.rapid_creation", "Rapid creation")}</SelectItem>
                           <SelectItem value="suspicious_ip">{t("staff:admin_autopunish.anomaly.suspicious_ip", "Suspicious IP")}</SelectItem>
                           <SelectItem value="hardware_ban_evasion">{t("staff:admin_autopunish.anomaly.hardware_ban_evasion", "Hardware ban evasion")}</SelectItem>
                         </SelectContent>
                       </Select>
                     </div>
                     <div className="space-y-2">
                       <Label>{t("staff:admin_autopunish.form.severity_threshold", "Severity threshold")}</Label>
                       <Select value={formData.severityThreshold} onValueChange={v => setFormData({ ...formData, severityThreshold: v })}>
                         <SelectTrigger><SelectValue /></SelectTrigger>
                         <SelectContent>
                           <SelectItem value="low">{severityLabels.low}</SelectItem>
                           <SelectItem value="medium">{severityLabels.medium}</SelectItem>
                           <SelectItem value="high">{severityLabels.high}</SelectItem>
                           <SelectItem value="critical">{severityLabels.critical}</SelectItem>
                         </SelectContent>
                       </Select>
                     </div>
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-2">
                       <Label>{t("staff:admin_autopunish.form.action", "Action")}</Label>
                       <Select value={formData.action} onValueChange={v => setFormData({ ...formData, action: v })}>
                         <SelectTrigger><SelectValue /></SelectTrigger>
                         <SelectContent>
                           <SelectItem value="warn">{t("staff:admin_autopunish.action.warn", "Warn user")}</SelectItem>
                           <SelectItem value="freeze">{t("staff:admin_autopunish.action.freeze", "Freeze account")}</SelectItem>
                           <SelectItem value="shadow_ban">{t("staff:admin_autopunish.action.shadow_ban", "Shadowban")}</SelectItem>
                           <SelectItem value="temp_ban">{t("staff:admin_autopunish.action.temp_ban", "Temporary IP ban")}</SelectItem>
                           <SelectItem value="ip_ban">{t("staff:admin_autopunish.action.ip_ban", "Permanent IP ban")}</SelectItem>
                           <SelectItem value="hardware_ban">{t("staff:admin_autopunish.action.hardware_ban", "Hardware ban")}</SelectItem>
                         </SelectContent>
                       </Select>
                     </div>
                     <div className="space-y-2">
                       <Label>{t("staff:admin_autopunish.form.duration_hours", "Duration (hours)")} <span className="text-muted-foreground text-xs">{t("staff:admin_autopunish.form.optional", "(optional)")}</span></Label>
                       <Input type="number" value={formData.actionDurationHours} onChange={e => setFormData({ ...formData, actionDurationHours: e.target.value })} />
                     </div>
                   </div>
                   
                   <div className="space-y-2 border-t pt-2">
                     <Label className="text-muted-foreground">{t("staff:admin_autopunish.form.advanced", "Advanced configuration")}</Label>
                     <div className="grid grid-cols-3 gap-4 mt-2">
                       <div className="space-y-1">
                         <Label className="text-xs">{t("staff:admin_autopunish.form.escalate_after_count", "Triggers after (count)")}</Label>
                         <Input type="number" min="1" value={formData.escalateAfterCount} onChange={e => setFormData({ ...formData, escalateAfterCount: e.target.value })} />
                         <p className="text-[10px] text-muted-foreground leading-tight mt-1">{t("staff:admin_autopunish.form.escalate_after_count_help", "Number of incidents before the rule triggers.")}</p>
                       </div>
                       <div className="space-y-1">
                         <Label className="text-xs">{t("staff:admin_autopunish.form.escalation_window_hours", "Time window (hours)")}</Label>
                         <Input type="number" min="1" value={formData.escalationWindowHours} onChange={e => setFormData({ ...formData, escalationWindowHours: e.target.value })} />
                         <p className="text-[10px] text-muted-foreground leading-tight mt-1">{t("staff:admin_autopunish.form.escalation_window_hours_help", "Period in which incidents are counted.")}</p>
                       </div>
                       <div className="space-y-1">
                         <Label className="text-xs">{t("staff:admin_autopunish.form.cooldown_hours", "Cooldown (hours)")}</Label>
                         <Input type="number" min="1" value={formData.cooldownHours} onChange={e => setFormData({ ...formData, cooldownHours: e.target.value })} />
                         <p className="text-[10px] text-muted-foreground leading-tight mt-1">{t("staff:admin_autopunish.form.cooldown_hours_help", "Waiting time before the rule can trigger again.")}</p>
                       </div>
                     </div>
                   </div>

                   <div className="space-y-2 border-t pt-4">
                     <Label>{t("staff:admin_autopunish.form.action_reason", "Action reason")} <span className="text-destructive">*</span></Label>
                     <Input value={formData.actionReason} onChange={e => setFormData({ ...formData, actionReason: e.target.value })} placeholder={t("staff:admin_autopunish.form.action_reason_placeholder", "Internal reason for this exact block...")} />
                   </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>{t("common.cancel", "Cancel")}</Button>
                  <Button onClick={handleCreate} disabled={createMutation.isPending}>{createMutation.isPending ? t("staff:admin_autopunish.form.saving", "Saving...") : t("common.save", "Save")}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="ov-label">{t("staff:admin_autopunish.rules.col_name", "Rule name")}</TableHead>
                  <TableHead className="ov-label">{t("staff:admin_autopunish.rules.col_trigger", "Trigger (anomaly)")}</TableHead>
                  <TableHead className="ov-label">{t("staff:admin_autopunish.rules.col_threshold", "Threshold")}</TableHead>
                  <TableHead className="ov-label">{t("staff:admin_autopunish.rules.col_action", "Automated action")}</TableHead>
                  <TableHead className="ov-label">{t("staff:admin_autopunish.col_status", "Status")}</TableHead>
                  <TableHead className="ov-label text-right">{t("staff:admin_autopunish.rules.col_manage", "Manage")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? <TableRow><TableCell colSpan={6} className="text-center py-6">{t("common.loading", "Loading...")}</TableCell></TableRow> : null}
                {data?.rules?.map(rule => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell><span className="ov-chip font-data">{rule.anomalyType}</span></TableCell>
                    <TableCell><span className={cn("ov-chip capitalize", severityChip[rule.severityThreshold])}>{severityLabels[rule.severityThreshold] ?? rule.severityThreshold}</span></TableCell>
                    <TableCell className="font-data text-xs">{rule.action}</TableCell>
                    <TableCell>
                      {rule.isActive ? <span className="ov-chip ov-chip-success">{t("staff:admin_autopunish.rules.status_active", "Active")}</span> : <span className="ov-chip">{t("staff:admin_autopunish.rules.status_disabled", "Disabled")}</span>}
                    </TableCell>
                    <TableCell className="text-right flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" aria-label={t("staff:admin_autopunish.rules.edit", "Edit rule")} onClick={() => {
                        setFormData({
                            name: rule.name || "",
                            description: rule.description || "",
                            anomalyType: rule.anomalyType || "api_abuse",
                            severityThreshold: rule.severityThreshold || "high",
                            action: rule.action || "warn",
                            actionReason: rule.actionReason || "",
                            actionDurationHours: rule.actionDurationHours ? rule.actionDurationHours.toString() : "",
                            cooldownHours: rule.cooldownHours ? rule.cooldownHours.toString() : "1",
                            escalateAfterCount: rule.escalateAfterCount ? rule.escalateAfterCount.toString() : "1",
                            escalationWindowHours: rule.escalationWindowHours ? rule.escalationWindowHours.toString() : "24",
                        });
                        setEditId(rule.id);
                        setIsCreateOpen(true);
                      }}>
                         <Pencil className="w-4 h-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={rule.isActive ? t("staff:admin_autopunish.rules.disable", "Disable rule") : t("staff:admin_autopunish.rules.enable", "Enable rule")} onClick={() => toggleMutation.mutate({ id: rule.id, isActive: !rule.isActive })}>
                         <Power className={rule.isActive ? "text-destructive w-4 h-4" : "text-primary w-4 h-4"} />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={t("staff:admin_autopunish.rules.delete", "Delete rule")} onClick={() => { if(window.confirm(t("staff:admin_autopunish.rules.delete_confirm", "Delete this rule?"))) deleteMutation.mutate(rule.id) }}>
                         <Trash2 className="text-destructive w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("staff:admin_autopunish.executions.title", "Recent executions")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="ov-label">{t("staff:admin_autopunish.executions.col_time", "Time")}</TableHead>
                  <TableHead className="ov-label">{t("staff:admin_autopunish.executions.col_rule", "Rule")}</TableHead>
                  <TableHead className="ov-label">{t("staff:admin_autopunish.executions.col_target", "Target user")}</TableHead>
                  <TableHead className="ov-label">{t("staff:admin_autopunish.executions.col_action", "Action taken")}</TableHead>
                  <TableHead className="ov-label">{t("staff:admin_autopunish.col_status", "Status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? <TableRow><TableCell colSpan={5} className="text-center py-6">{t("common.loading", "Loading...")}</TableCell></TableRow> : null}
                {data?.executions?.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">{t("staff:admin_autopunish.executions.empty", "No recent executions")}</TableCell></TableRow>}
                {data?.executions?.map(exec => (
                  <TableRow key={exec.id}>
                    <TableCell className="ov-data text-xs text-muted-foreground">
                        {new Date(typeof exec.createdAt === "number" ? exec.createdAt * 1000 : exec.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-medium">{exec.ruleName}</TableCell>
                    <TableCell>{t("staff:admin_autopunish.executions.user", "User")} <span className="ov-data">#{exec.userId}</span></TableCell>
                    <TableCell className="font-data text-xs">{exec.actionTaken}</TableCell>
                    <TableCell>
                      {exec.success ? <span className="ov-chip ov-chip-success">{t("staff:admin_autopunish.executions.success", "Success")}</span> : <span className="ov-chip ov-chip-danger">{t("staff:admin_autopunish.executions.failed", "Failed")}</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
  );
}
