import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { TicketStatusBadge, TicketPriorityBadge } from "./badges";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import type { TicketWithMeta } from "@/hooks/use-tickets";
import { Clock, User } from "lucide-react";
import { cn } from "@/lib/utils";

export function TicketCard({ ticket, showOwnerFeatures }: { ticket: TicketWithMeta, showOwnerFeatures: boolean }) {
  const { t } = useTranslation("tickets");

  const isCritical = ticket.priority === 'critical' && ticket.status !== 'closed';

  return (
    <Link href={`/tickets/${ticket.id}`}>
      <Card className={cn(
        "group relative glass-premium border-white/5 transition-all duration-500 cursor-pointer overflow-hidden hover:-translate-y-1 hover:border-white/10 hover:shadow-2xl hover:shadow-primary/10",
        isCritical && "ring-1 ring-red-500/20"
      )}>
        {/* Pulsing indicator for critical tickets */}
        {isCritical && (
          <div className="absolute top-0 left-0 w-1 h-full bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)] animate-pulse" />
        )}
        
        <CardHeader className="relative z-10 pb-3 pt-6 px-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-[10px] font-black tracking-widest text-primary/40 bg-primary/5 px-2 py-0.5 rounded-full border border-primary/10">#{ticket.ticketNumber}</span>
              <TicketPriorityBadge priority={ticket.priority} />
              <Badge variant="secondary" className="text-[9px] font-black uppercase tracking-widest bg-white/5 border-none">{t(`types.${ticket.type}`, ticket.type)}</Badge>
            </div>
            <TicketStatusBadge status={ticket.status} />
          </div>
          <CardTitle className="text-lg font-black tracking-tighter leading-tight group-hover:text-primary transition-colors duration-500 line-clamp-1">{ticket.title}</CardTitle>
        </CardHeader>
        <CardContent className="relative z-10 px-6 pb-6">
          <div className="flex flex-wrap items-center gap-6 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-primary/40" />
              <span>{formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}</span>
            </div>
            {showOwnerFeatures && (
              <>
                <div className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-primary/40" />
                  <span>{ticket.creatorUsername}</span>
                </div>
                {ticket.assignedTo ? (
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span className="text-emerald-500/80">Active</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse" />
                    <span className="text-orange-500/80 italic">Awaiting Pilot</span>
                  </div>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
