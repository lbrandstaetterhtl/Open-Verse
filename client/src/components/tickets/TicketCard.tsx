import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { TicketStatusBadge, TicketPriorityBadge } from "./badges";
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
        "ov-panel-hover group cursor-pointer overflow-hidden",
        isCritical && "[--ov-line:hsl(var(--destructive)/0.45)]"
      )}>
        {/* Marker for critical tickets */}
        {isCritical && (
          <div className="absolute inset-y-0 left-0 w-0.5 bg-destructive" aria-hidden="true" />
        )}

        <CardHeader className="pb-3 pt-5 px-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="ov-data text-xs text-muted-foreground">#{ticket.ticketNumber}</span>
              <TicketPriorityBadge priority={ticket.priority} />
              <span className="ov-chip">{t(`types.${ticket.type}`, ticket.type)}</span>
            </div>
            <TicketStatusBadge status={ticket.status} />
          </div>
          <CardTitle className="text-lg leading-tight group-hover:text-primary transition-colors line-clamp-1">{ticket.title}</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" />
              <span className="ov-data">{formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}</span>
            </div>
            {showOwnerFeatures && (
              <>
                <div className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5" />
                  <span>{ticket.creatorUsername}</span>
                </div>
                {ticket.assignedTo ? (
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                    <span className="text-primary">{t("assignment.active", "Active")}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-star" />
                    <span className="text-star">{t("assignment.unassigned", "Awaiting Pilot")}</span>
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
