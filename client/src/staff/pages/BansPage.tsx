import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { useTranslation } from "react-i18next";
import { ShieldOff } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function BansPage() {
  const { t } = useTranslation();
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
      toast({ title: t("staff:admin_bans.toast.revoked", "Ban revoked") });
    }
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
        <PageHeader
          eyebrow={
            <span className="inline-flex items-center gap-2">
              <ShieldOff className="h-3.5 w-3.5 text-destructive" />
              {t("staff:admin_bans.eyebrow", "Moderation core")}
            </span>
          }
          title={t("staff:admin_bans.title", "Ban management")}
          description={t("staff:admin_bans.description", "Manage IP, hardware, and account bans in zero gravity.")}
        />

        <div className="ov-panel overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-transparent">
                <TableHead className="ov-label h-12 px-6">{t("staff:admin_bans.table.type", "Type")}</TableHead>
                <TableHead className="ov-label h-12 px-6">{t("staff:admin_bans.table.target", "Target")}</TableHead>
                <TableHead className="ov-label h-12 px-6">{t("staff:admin_bans.table.reason", "Reason")}</TableHead>
                <TableHead className="ov-label h-12 px-6">{t("staff:admin_bans.table.status", "Status")}</TableHead>
                <TableHead className="ov-label h-12 px-6">{t("staff:admin_bans.table.source", "Source")}</TableHead>
                <TableHead className="ov-label h-12 px-6 text-right">{t("staff:admin_bans.table.operations", "Operations")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-20 text-sm text-muted-foreground animate-pulse">{t("staff:admin_bans.loading", "Scanning transmission...")}</TableCell></TableRow>
              ) : bans?.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-20 text-sm text-muted-foreground">{t("staff:admin_bans.empty", "No active bans in this sector")}</TableCell></TableRow>
              ) : (
                bans?.map((ban) => (
                  <TableRow key={ban.id} className="group">
                    <TableCell className="px-6">
                      <div className={cn("ov-chip font-data", ban.banType === 'hardware' ? "ov-chip-danger" : "ov-chip-primary")}>
                        {ban.banType}
                      </div>
                    </TableCell>
                    <TableCell className="px-6 font-data text-xs text-primary">
                      {ban.ipAddress || ban.deviceFingerprint || t("staff:admin_bans.target_user", { id: ban.userId, defaultValue: "USER::{{id}}" })}
                    </TableCell>
                    <TableCell className="px-6 text-xs max-w-xs truncate text-muted-foreground group-hover:text-foreground transition-colors">"{ban.reason}"</TableCell>
                    <TableCell className="px-6">
                      {ban.isActive ? (
                        <div className="ov-chip ov-chip-danger">
                          <div className="h-1.5 w-1.5 rounded-full bg-destructive" />
                          {t("staff:admin_bans.status.active", "Active")}
                        </div>
                      ) : (
                        <div className="ov-chip opacity-60">{t("staff:admin_bans.status.revoked", "Revoked")}</div>
                      )}
                    </TableCell>
                    <TableCell className="px-6"><span className="ov-label">{ban.createdByType}</span></TableCell>
                    <TableCell className="px-6 text-right">
                      {ban.isActive && (
                        <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => revokeMutation.mutate(ban.id)}>
                          {t("staff:admin_bans.revoke", "Revoke")}
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
