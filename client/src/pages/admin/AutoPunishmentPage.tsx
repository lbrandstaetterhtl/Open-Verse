import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ShieldAlert, Zap, Plus, Trash2, Power, Pencil } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function AutoPunishmentPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
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
      toast({ title: editId ? "Rule updated successfully" : "Rule created successfully" });
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
      toast({ title: "Rule deleted" });
    }
  });

  const handleCreate = () => {
     if (!formData.name || !formData.actionReason) {
         return toast({ title: "Validation Error", description: "Name and Action Reason required", variant: "destructive" });
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

  return (
    <div className="space-y-8">
        <div>
           <h1 className="text-3xl font-bold flex items-center gap-2"><Zap className="h-8 w-8 text-yellow-500" /> Auto-Punishment Engine</h1>
           <p className="text-muted-foreground">Automated threat response and mitigation rules.</p>
        </div>

        <Card>
          <CardHeader className="flex flex-row justify-between items-center">
            <CardTitle className="text-lg flex items-center gap-2"><ShieldAlert className="h-5 w-5" /> Active Rules</CardTitle>
            <Dialog open={isCreateOpen} onOpenChange={open => { setIsCreateOpen(open); if (!open) setEditId(null); }}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={() => { setEditId(null); setFormData(emptyForm); }}><Plus className="w-4 h-4 mr-2" /> New Rule</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{editId ? "Edit" : "Create"} Auto-Punishment Rule</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                   <div className="space-y-2">
                     <Label>Rule Name</Label>
                     <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Strict API Abuser Block" />
                   </div>
                   <div className="space-y-2">
                     <Label>Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
                     <Input value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="What exactly does this rule prevent?" />
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-2">
                       <Label>Anomaly Trigger</Label>
                       <Select value={formData.anomalyType} onValueChange={v => setFormData({ ...formData, anomalyType: v })}>
                         <SelectTrigger><SelectValue /></SelectTrigger>
                         <SelectContent>
                           <SelectItem value="brute_force_login">Brute Force Login</SelectItem>
                           <SelectItem value="api_abuse">API Abuse</SelectItem>
                           <SelectItem value="spam_content">Spam Content</SelectItem>
                           <SelectItem value="rapid_creation">Rapid Creation</SelectItem>
                           <SelectItem value="suspicious_ip">Suspicious IP</SelectItem>
                           <SelectItem value="hardware_ban_evasion">HW Ban Evasion</SelectItem>
                         </SelectContent>
                       </Select>
                     </div>
                     <div className="space-y-2">
                       <Label>Severity Threshold</Label>
                       <Select value={formData.severityThreshold} onValueChange={v => setFormData({ ...formData, severityThreshold: v })}>
                         <SelectTrigger><SelectValue /></SelectTrigger>
                         <SelectContent>
                           <SelectItem value="low">Low</SelectItem>
                           <SelectItem value="medium">Medium</SelectItem>
                           <SelectItem value="high">High</SelectItem>
                           <SelectItem value="critical">Critical</SelectItem>
                         </SelectContent>
                       </Select>
                     </div>
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-2">
                       <Label>Action Execution</Label>
                       <Select value={formData.action} onValueChange={v => setFormData({ ...formData, action: v })}>
                         <SelectTrigger><SelectValue /></SelectTrigger>
                         <SelectContent>
                           <SelectItem value="warn">Warn User</SelectItem>
                           <SelectItem value="freeze">Freeze Account</SelectItem>
                           <SelectItem value="shadow_ban">Shadowban</SelectItem>
                           <SelectItem value="temp_ban">Temp IP Ban</SelectItem>
                           <SelectItem value="ip_ban">Perm IP Ban</SelectItem>
                           <SelectItem value="hardware_ban">Hardware Ban</SelectItem>
                         </SelectContent>
                       </Select>
                     </div>
                     <div className="space-y-2">
                       <Label>Duration (Hours) <span className="text-muted-foreground text-xs">(optional)</span></Label>
                       <Input type="number" value={formData.actionDurationHours} onChange={e => setFormData({ ...formData, actionDurationHours: e.target.value })} />
                     </div>
                   </div>
                   
                   <div className="space-y-2 border-t pt-2">
                     <Label className="text-muted-foreground">Advanced Configuration</Label>
                     <div className="grid grid-cols-3 gap-4 mt-2">
                       <div className="space-y-1">
                         <Label className="text-xs">Triggers after (Count)</Label>
                         <Input type="number" min="1" value={formData.escalateAfterCount} onChange={e => setFormData({ ...formData, escalateAfterCount: e.target.value })} />
                         <p className="text-[10px] text-muted-foreground leading-tight mt-1">Anzahl der Vorfälle bevor Regel auslöst.</p>
                       </div>
                       <div className="space-y-1">
                         <Label className="text-xs">Time Window (Hours)</Label>
                         <Input type="number" min="1" value={formData.escalationWindowHours} onChange={e => setFormData({ ...formData, escalationWindowHours: e.target.value })} />
                         <p className="text-[10px] text-muted-foreground leading-tight mt-1">Zeitraum, in dem der Count gesammelt wird.</p>
                       </div>
                       <div className="space-y-1">
                         <Label className="text-xs">Cooldown (Hours)</Label>
                         <Input type="number" min="1" value={formData.cooldownHours} onChange={e => setFormData({ ...formData, cooldownHours: e.target.value })} />
                         <p className="text-[10px] text-muted-foreground leading-tight mt-1">Sperrzeit, bis Regel erneut anschlägt.</p>
                       </div>
                     </div>
                   </div>

                   <div className="space-y-2 border-t pt-4">
                     <Label>Action Reason <span className="text-red-500">*</span></Label>
                     <Input value={formData.actionReason} onChange={e => setFormData({ ...formData, actionReason: e.target.value })} placeholder="Internal reason for this exact block..." />
                   </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreate} disabled={createMutation.isPending}>{createMutation.isPending ? "Saving..." : "Save"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rule Name</TableHead>
                  <TableHead>Trigger (Anomaly)</TableHead>
                  <TableHead>Threshold</TableHead>
                  <TableHead>Automated Action</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Manage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? <TableRow><TableCell colSpan={6} className="text-center py-6">Loading...</TableCell></TableRow> : null}
                {data?.rules?.map(rule => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell><Badge variant="outline">{rule.anomalyType}</Badge></TableCell>
                    <TableCell><Badge variant="secondary">{rule.severityThreshold}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{rule.action}</TableCell>
                    <TableCell>
                      {rule.isActive ? <Badge className="bg-emerald-500">Active</Badge> : <Badge variant="outline">Disabled</Badge>}
                    </TableCell>
                    <TableCell className="text-right flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => {
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
                      <Button variant="ghost" size="icon" onClick={() => toggleMutation.mutate({ id: rule.id, isActive: !rule.isActive })}>
                         <Power className={rule.isActive ? "text-red-500 w-4 h-4" : "text-emerald-500 w-4 h-4"} />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { if(window.confirm('Delete this rule?')) deleteMutation.mutate(rule.id) }}>
                         <Trash2 className="text-red-500 w-4 h-4" />
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
            <CardTitle className="text-lg">Recent Executions</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Rule</TableHead>
                  <TableHead>Target User</TableHead>
                  <TableHead>Action Taken</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? <TableRow><TableCell colSpan={5} className="text-center py-6">Loading...</TableCell></TableRow> : null}
                {data?.executions?.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No recent executions</TableCell></TableRow>}
                {data?.executions?.map(exec => (
                  <TableRow key={exec.id}>
                    <TableCell className="text-xs text-muted-foreground">
                        {new Date(exec.createdAt * 1000).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-medium">{exec.ruleName}</TableCell>
                    <TableCell>User #{exec.userId}</TableCell>
                    <TableCell className="font-mono text-xs">{exec.actionTaken}</TableCell>
                    <TableCell>
                      {exec.success ? <Badge className="bg-emerald-500">Success</Badge> : <Badge variant="destructive">Failed</Badge>}
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
