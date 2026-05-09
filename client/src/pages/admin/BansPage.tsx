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
    <div className="space-y-10 animate-in fade-in duration-700">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-red-500">
              <ShieldOff className="h-5 w-5 stroke-[2.5px]" />
              <span className="text-[10px] font-black uppercase tracking-[0.4em]">Moderation Core</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase italic leading-none">
              Ban <span className="text-transparent bg-clip-text bg-gradient-to-br from-red-500 to-orange-500">Management</span>
            </h1>
            <p className="text-lg text-muted-foreground/60 font-medium">Manage IP, Hardware, and Account Bans in zero-gravity.</p>
          </div>
        </div>

        <div className="glass-premium border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl shadow-black/20">
          <Table>
            <TableHeader className="bg-white/5 backdrop-blur-3xl border-b border-white/5">
              <TableRow className="hover:bg-transparent border-none">
                <TableHead className="h-14 px-8 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Type</TableHead>
                <TableHead className="h-14 px-8 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Target</TableHead>
                <TableHead className="h-14 px-8 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Reason</TableHead>
                <TableHead className="h-14 px-8 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Status</TableHead>
                <TableHead className="h-14 px-8 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Source</TableHead>
                <TableHead className="h-14 px-8 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground text-right">Operations</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-20 font-black uppercase tracking-widest text-xs opacity-40 animate-pulse">Scanning Transmission...</TableCell></TableRow>
              ) : bans?.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-20 text-muted-foreground/40 font-bold uppercase tracking-widest text-xs italic">No active bans in this sector</TableCell></TableRow>
              ) : (
                bans?.map((ban) => (
                  <TableRow key={ban.id} className="group hover:bg-white/5 transition-colors border-white/5">
                    <TableCell className="px-8">
                      <Badge variant={ban.banType === 'hardware' ? 'destructive' : 'default'} className="text-[9px] font-black uppercase tracking-widest px-3">
                        {ban.banType}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-8 font-mono text-[11px] font-bold text-primary/80">
                      {ban.ipAddress || ban.deviceFingerprint || `USER::${ban.userId}`}
                    </TableCell>
                    <TableCell className="px-8 text-xs font-medium max-w-xs truncate opacity-70 italic group-hover:opacity-100 transition-opacity">"{ban.reason}"</TableCell>
                    <TableCell className="px-8">
                      {ban.isActive ? (
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 text-red-500 text-[9px] font-black uppercase tracking-widest border border-red-500/20 shadow-lg shadow-red-500/5">
                          <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                          Active
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest border-white/10 opacity-40">Revoked</Badge>
                      )}
                    </TableCell>
                    <TableCell className="px-8 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">{ban.createdByType}</TableCell>
                    <TableCell className="px-8 text-right">
                      {ban.isActive && (
                        <Button variant="ghost" size="sm" className="h-9 px-4 rounded-full font-black uppercase tracking-widest text-[9px] text-red-400 hover:bg-red-500 hover:text-white transition-all active:scale-95 shadow-xl shadow-red-500/10" onClick={() => revokeMutation.mutate(ban.id)}>
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
