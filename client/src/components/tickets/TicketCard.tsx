import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { TicketStatusBadge, TicketPriorityBadge } from "./badges";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import type { TicketWithMeta } from "@/hooks/use-tickets";
import { Clock, User } from "lucide-react";

export function TicketCard({ ticket, showOwnerFeatures }: { ticket: TicketWithMeta, showOwnerFeatures: boolean }) {
  const { t } = useTranslation("tickets");

  const isCritical = ticket.priority === 'critical';

  return (
    <Link href={`/tickets/${ticket.id}`}>
      <Card className={`hover:bg-accent/5 transition-colors cursor-pointer border-l-4 ${isCritical && ticket.status !== 'closed' ? 'border-l-red-500' : 'border-l-transparent dark:border-l-white/10 dark:hover:border-l-white/20'}`}>
        <CardHeader className="pb-2 pt-4 px-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-semibold text-muted-foreground">{ticket.ticketNumber}</span>
              <TicketPriorityBadge priority={ticket.priority} />
              <Badge variant="secondary" className="text-[10px] uppercase">{t(`types.${ticket.type}`, ticket.type)}</Badge>
            </div>
            <TicketStatusBadge status={ticket.status} />
          </div>
          <CardTitle className="text-base leading-tight mt-1 truncate">{ticket.title}</CardTitle>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-4">
          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>{t('fields.createdAt')}: {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}</span>
            </div>
            {showOwnerFeatures && (
              <>
                <div className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  <span>{t('fields.createdBy')}: <span className="font-semibold text-foreground/80">{ticket.creatorUsername}</span></span>
                </div>
                {ticket.assignedTo && (
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    <span>{t('fields.assignedTo')}: <span className="font-semibold">{ticket.assignedTo}</span></span>
                  </div>
                )}
                {!ticket.assignedTo && (
                  <div className="text-orange-500/80 font-medium italic">Unassigned</div>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
