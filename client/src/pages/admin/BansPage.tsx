import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { Plus, ShieldOff } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function BansPage() {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: bans, isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/bans"],
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PATCH", `/api/admin/bans/${id}/revoke`, { reason: "Admin Override" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bans"] });
      toast({ title: t("bulk.success", "Operation successful") });
    }
  });

  return (
    <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Ban Management</h1>
            <p className="text-muted-foreground">Manage IP, Hardware, and Account Bans</p>
          </div>
        </div>

        <div className="bg-card border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10">Loading...</TableCell></TableRow>
              ) : bans?.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">No bans found</TableCell></TableRow>
              ) : (
                bans?.map((ban) => (
                  <TableRow key={ban.id}>
                    <TableCell>
                      <Badge variant={ban.banType === 'hardware' ? 'destructive' : 'default'}>{ban.banType}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {ban.ipAddress || ban.deviceFingerprint || `User #${ban.userId}`}
                    </TableCell>
                    <TableCell className="text-sm max-w-xs truncate">{ban.reason}</TableCell>
                    <TableCell>
                      {ban.isActive ? <Badge variant="destructive">Active</Badge> : <Badge variant="outline">Revoked</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{ban.createdByType}</TableCell>
                    <TableCell className="text-right">
                      {ban.isActive && (
                        <Button variant="ghost" size="sm" onClick={() => revokeMutation.mutate(ban.id)}>
                          Revoke
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
