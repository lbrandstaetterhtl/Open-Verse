import { Suspense, useState } from "react";
import { EXTERNAL_LINK_REL, safeExternalUrl } from "@/lib/safe-url";
import { LIMITS } from "@/lib/input-limits";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useLocation, useParams } from "wouter";
import { useTicket, useAddComment, useUpdateTicket, useDeleteTicket } from "@/hooks/use-tickets";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TicketStatusBadge, TicketPriorityBadge } from "@/components/tickets/badges";
import { Loader2, History, User, Clock, UserCircle } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { BackButton } from "@/components/ui/back-button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";
import { TicketAssignSelect } from "@/lib/staff";

import { useDateLocale } from "@/lib/date-locale";

/** Name the server gives staff in a ticket creator's view (server/services/ticket-service.ts). */
const SUPPORT_NAME = "Support";

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const ticketId = parseInt(id);
  const { t } = useTranslation("tickets");
  const dateLocale = useDateLocale();
  // System comments are stored in English by the server; render them from their change data instead.
  const systemMessage = (c: { content: string; changeType?: string | null; changeFrom?: string | null; changeTo?: string | null }) => {
    if (!c.changeType) return c.content;
    const label = (v?: string | null) =>
      !v ? "" : c.changeType === "status_change" ? t(`status.${v}`, v) : c.changeType === "priority_change" ? t(`priority.${v}`, v)
        : v === SUPPORT_NAME ? t("detail.support", "Support") : v;
    return t(`systemMessages.${c.changeType}`, { from: label(c.changeFrom), to: label(c.changeTo), defaultValue: c.content });
  };
  const { user } = useAuth();
  const { toast } = useToast();

  const { data, isLoading, isError, error, refetch } = useTicket(ticketId);
  const { mutateAsync: addComment, isPending: isAddingComment } = useAddComment();
  const { mutateAsync: updateTicket, isPending: isUpdating } = useUpdateTicket();
  const { mutateAsync: deleteTicket, isPending: isDeleting } = useDeleteTicket();

  const [commentText, setCommentText] = useState("");
  const [isInternal, setIsInternal] = useState(false);

  const isOwner = user?.role === "owner";

  const validId = Number.isInteger(ticketId) && ticketId > 0;

  if (validId && isLoading) {
    return <div className="flex items-center justify-center h-full pt-32"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  if (!validId || data === null) {
    return (
      <EmptyState
        className="pt-24"
        title={t("errors.notFound", "Ticket not found")}
        description={t("errors.notFoundHint", "This ticket doesn't exist or you don't have access to it.")}
        action={{ label: t("actions.backToTickets", "Back to my tickets"), onClick: () => setLocation("/tickets") }}
      />
    );
  }

  if (isError || !data) {
    return (
      <ErrorState
        className="pt-24"
        title={t("errors.loadTicketFailed", "The ticket could not be loaded")}
        message={t("errors.tryAgainHint", "Please try again in a moment.")}
        retry={() => refetch()}
      />
    );
  }

  const { ticket, comments } = data;

  const handleUpdateStatus = async (status: string) => {
    try {
      await updateTicket({ id: ticket.id, data: { status } });
      toast({ title: t("success.statusChanged", { status: t(`status.${status}`, status) }) });
    } catch (err: any) {
      toast({ title: t("errors.invalidTransition"), description: err.message, variant: "destructive" });
    }
  };

  const handleUpdatePriority = async (priority: string) => {
    try {
      await updateTicket({ id: ticket.id, data: { priority } });
    } catch {
      toast({ title: t("errors.updateFailed", "Failed to update ticket"), variant: "destructive" });
    }
  };

  const handleUpdateAssignment = async (assignedTo: number | null) => {
    try {
      await updateTicket({ id: ticket.id, data: { assignedTo } });
      toast({ title: t("success.assignmentUpdated", "Assignment updated") });
    } catch {
      toast({ title: t("errors.assignFailed", "Failed to assign ticket"), variant: "destructive" });
    }
  };

  const handleCommentSubmit = async () => {
    if (!commentText.trim()) return;
    try {
      await addComment({ ticketId: ticket.id, content: commentText, isInternal });
      setCommentText("");
      setIsInternal(false);
      toast({ title: t("success.commentAdded") });
    } catch (err: any) {
      toast({ title: t("errors.commentFailed"), description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="container max-w-6xl mx-auto py-12 px-4 pt-24 pb-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <BackButton fallback="/tickets" className="mb-2 -ml-3" />

        <PageHeader
          eyebrow={t("title", "Tickets")}
          title={ticket.title}
          actions={
            <>
              {isOwner && ticket.status !== 'closed' && (
                <Button variant="destructive" disabled={isUpdating || isDeleting} onClick={async () => {
                   if (confirm(t("confirmations.deleteTicketConfirm", "Are you sure you want to delete this ticket?"))) {
                     try {
                       await deleteTicket(ticket.id);
                       toast({ title: t("success.ticketDeleted", "Ticket deleted successfully") });
                       setLocation("/tickets");
                     } catch (err: any) {
                       toast({ title: t("errors.deleteFailed", "Failed to delete ticket"), description: err.message, variant: "destructive" });
                     }
                   }
                }}>
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("actions.decommission", "Decommission Signal")}
                </Button>
              )}
              {(!isOwner && ticket.status !== 'closed') && (
                <Button variant="destructive" disabled={isUpdating} onClick={() => handleUpdateStatus('closed')}>
                  {t("actions.deactivate", "Deactivate Transmission")}
                </Button>
              )}
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="ov-data text-sm text-muted-foreground">#{ticket.ticketNumber}</span>
            <TicketStatusBadge status={ticket.status} />
            <TicketPriorityBadge priority={ticket.priority} />
          </div>
        </PageHeader>

        <div className="mt-8 grid lg:grid-cols-[1fr,350px] gap-8">
          <div className="space-y-8">
            {/* Main Description */}
            <Card className="overflow-hidden">
              <CardHeader className="px-6 py-4 ov-rule">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <UserCircle className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-foreground">{ticket.creatorUsername}</span>
                  <span className="text-muted-foreground">{t("detail.initiatedSignal", "initiated signal")}</span>
                  <span className="ov-data text-xs text-muted-foreground ml-auto" title={format(new Date(ticket.createdAt), "PPpp", { locale: dateLocale })}>{formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true, locale: dateLocale })}</span>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="prose dark:prose-invert max-w-none text-base leading-relaxed whitespace-pre-wrap">
                  {ticket.description}
                </div>
              </CardContent>
            </Card>

            {/* Activity Timeline */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                  <History className="w-4 h-4 text-primary" />
                  {t("detail.history", "Transmission History")}
                </h3>
              </div>

              <div className="space-y-4">
                {comments.map(comment => {
                  if (comment.isSystem) {
                    return (
                      <div key={comment.id} className="relative flex items-center gap-3 ml-8 pl-4 pr-2 py-2 border-l border-border text-xs text-muted-foreground group">
                        <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
                        <span className="truncate">{systemMessage(comment)}</span>
                        <span className="ov-data ml-auto shrink-0" title={format(new Date(comment.createdAt), "PPpp", { locale: dateLocale })}>{formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true, locale: dateLocale })}</span>
                      </div>
                    );
                  }

                  return (
                    <div key={comment.id} className={cn(
                      "ov-panel group flex gap-4 p-5",
                      comment.isInternal && "[--ov-line:hsl(var(--star)/0.45)]"
                    )}>
                      <div className="relative shrink-0">
                        <div className="ov-avatar w-10 h-10 bg-primary/10 flex items-center justify-center">
                          <User className="w-5 h-5 text-primary" />
                        </div>
                        {comment.authorRole === 'owner' && <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-destructive border-2 border-background" />}
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          {/* Ticket creators see staff replies under one team name (authorRole "staff", no account name) */}
                          <span className="text-sm font-semibold">{comment.authorRole === "staff" ? t("detail.support", "Support") : comment.authorUsername}</span>
                          {comment.authorRole === 'owner' && <span className="ov-chip ov-chip-danger">{t("detail.commanderBadge", "COMMANDER")}</span>}
                          <span className="ov-data text-xs text-muted-foreground" title={format(new Date(comment.createdAt), "PPpp", { locale: dateLocale })}>
                            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true, locale: dateLocale })}
                          </span>
                          {comment.isInternal && <span className="ov-chip ov-chip-star ml-auto">{t("detail.internalBadge", "INTERNAL SIGNAL")}</span>}
                        </div>
                        <div className="text-[15px] leading-relaxed text-foreground/90 whitespace-pre-wrap">
                          {comment.content}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Comment Form */}
              {ticket.status !== 'closed' && (
                <div className="ov-panel mt-8 overflow-hidden focus-within:[--ov-line:hsl(var(--primary)/0.6)]">
                  <Textarea
                    className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none bg-transparent p-5 min-h-[160px] text-base resize-none"
                    placeholder={t("comments.placeholder", "Add a comment...")}
                    value={commentText}
                    maxLength={LIMITS.ticketComment}
                    onChange={e => setCommentText(e.target.value)}
                  />
                  <div className="border-t border-border px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div>
                      {isOwner && (
                        <div className="flex items-center gap-3">
                          <Switch id="internal-mode" checked={isInternal} onCheckedChange={setIsInternal} className="data-[state=checked]:bg-star" />
                          <Label htmlFor="internal-mode" className="text-sm font-medium cursor-pointer select-none text-star">{t("detail.internalChannel", "Secure Internal Channel")}</Label>
                        </div>
                      )}
                    </div>
                    <Button disabled={!commentText.trim() || isAddingComment} onClick={handleCommentSubmit} className="w-full sm:w-48">
                      {isAddingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : t("detail.transmit", "Transmit Response")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            <Card className="sticky top-28">
              <CardHeader className="px-6 py-4 ov-rule">
                <CardTitle className="text-lg">{t("detail.sidebarTitle", "Signal Core")}</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="ov-label block">{t("detail.statusPhase", "Status Phase")}</label>
                  {isOwner ? (
                    <Select value={ticket.status} onValueChange={handleUpdateStatus} disabled={isUpdating}>
                      <SelectTrigger className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['open', 'in_progress', 'on_hold', 'resolved', 'closed'].map(s => (
                          <SelectItem key={s} value={s}>{t(`status.${s}`, s)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="h-10 flex items-center"><TicketStatusBadge status={ticket.status} /></div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="ov-label block">{t("detail.priorityLevel", "Priority Level")}</label>
                  {isOwner ? (
                    <Select value={ticket.priority} onValueChange={handleUpdatePriority} disabled={isUpdating}>
                      <SelectTrigger className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['low', 'medium', 'high', 'critical'].map(p => (
                          <SelectItem key={p} value={p}>{t(`priority.${p}`, p)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="h-10 flex items-center"><TicketPriorityBadge priority={ticket.priority} /></div>
                  )}
                </div>

                <div className="pt-6 border-t border-border space-y-4">
                  <div className="flex justify-between items-center gap-3">
                    <span className="ov-label">{t("fields.type", "Type")}</span>
                    <span className="ov-chip">{t(`types.${ticket.type}`, ticket.type)}</span>
                  </div>

                  {ticket.relatedUrl && (
                    <div className="flex flex-col gap-1.5">
                      <span className="ov-label">{t("detail.relatedSignal", "Related Signal")}</span>
                      {safeExternalUrl(ticket.relatedUrl) ? (
                        <a href={safeExternalUrl(ticket.relatedUrl)!} target="_blank" rel={EXTERNAL_LINK_REL} className="ov-data text-xs text-primary hover:underline underline-offset-4 truncate">{ticket.relatedUrl}</a>
                      ) : (
                        // Not an http(s) address: shown as text, never as a link
                        <span className="ov-data text-xs truncate">{ticket.relatedUrl}</span>
                      )}
                    </div>
                  )}

                  <div className="flex flex-col gap-2 pt-4 border-t border-border">
                    <span className="ov-label">{t("detail.assignedPersonnel", "Assigned Personnel")}</span>
                    {isOwner ? (
                      <Suspense fallback={<div className="h-10" />}>
                        <TicketAssignSelect assignedTo={typeof ticket.assignedTo === "number" ? ticket.assignedTo : null} disabled={isUpdating} onChange={handleUpdateAssignment} />
                      </Suspense>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className={cn("ov-chip", ticket.assignedTo ? "ov-chip-primary" : "ov-chip-star")}>
                          {ticket.assignedTo ? t("assignment.assigned", "Personnel Active") : t("assignment.unassigned", "Awaiting Pilot")}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
