import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useParams } from "wouter";
import { useTicket, useAddComment, useUpdateTicket, useDeleteTicket } from "@/hooks/use-tickets";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TicketStatusBadge, TicketPriorityBadge } from "@/components/tickets/badges";
import { Loader2, History, User, Clock, UserCircle2 } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { BackButton } from "@/components/ui/back-button";

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const ticketId = parseInt(id);
  const { t } = useTranslation("tickets");
  const { user } = useAuth();
  const { toast } = useToast();
  
  const { data, isLoading, isError, error, refetch } = useTicket(ticketId);
  const { mutateAsync: addComment, isPending: isAddingComment } = useAddComment();
  const { mutateAsync: updateTicket, isPending: isUpdating } = useUpdateTicket();
  const { mutateAsync: deleteTicket, isPending: isDeleting } = useDeleteTicket();

  const [commentText, setCommentText] = useState("");
  const [isInternal, setIsInternal] = useState(false);

  const isOwner = user?.role === "owner";

  const { data: usersData } = useQuery<any[]>({
    queryKey: ["/api/admin/users"],
    enabled: isOwner,
  });

  const staffUsers = usersData?.filter(u => u.role === "admin" || u.role === "owner") || [];

  if (isLoading) {
    return <div className="flex items-center justify-center h-full pt-32"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  if (isError || !data) {
    return (
      <div className="pt-20 flex flex-col items-center justify-center text-center">
        <p className="text-red-500 mb-2">{(error as any)?.message || "Failed to load"}</p>
        <Button variant="outline" onClick={() => refetch()}>Try Again</Button>
      </div>
    );
  }

  const { ticket, comments } = data;

  const handleUpdateStatus = async (status: string) => {
    try {
      await updateTicket({ id: ticket.id, data: { status } });
      toast({ title: t("success.statusChanged", { status }) });
    } catch (err: any) {
      toast({ title: t("errors.invalidTransition"), description: err.message, variant: "destructive" });
    }
  };

  const handleUpdatePriority = async (priority: string) => {
    try {
      await updateTicket({ id: ticket.id, data: { priority } });
    } catch {
      toast({ title: "Failed to update", variant: "destructive" });
    }
  };

  const handleUpdateAssignment = async (assignedTo: number | null) => {
    try {
      await updateTicket({ id: ticket.id, data: { assignedTo } });
      toast({ title: "Assignment updated" });
    } catch {
      toast({ title: "Failed to assign", variant: "destructive" });
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
    <div className="container max-w-6xl mx-auto py-8 px-4 pt-20">
      <BackButton fallback="/tickets" className="mb-6 -ml-4 font-semibold" />

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="font-mono text-sm text-muted-foreground">{ticket.ticketNumber}</span>
            <TicketStatusBadge status={ticket.status} />
            <TicketPriorityBadge priority={ticket.priority} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{ticket.title}</h1>
        </div>
        {isOwner && ticket.status !== 'closed' && (
          <Button variant="destructive" disabled={isUpdating || isDeleting} onClick={async () => {
             if (confirm("Are you sure you want to delete this ticket?")) {
               try {
                 await deleteTicket(ticket.id);
                 toast({ title: t("success.ticketDeleted", "Ticket deleted successfully") });
                 setLocation("/tickets");
               } catch (err: any) {
                 toast({ title: "Delete Failed", description: err.message, variant: "destructive" });
               }
             }
          }}>
            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
          </Button>
        )}
        {(!isOwner && ticket.status !== 'closed') && (
          <Button variant="destructive" disabled={isUpdating} onClick={() => handleUpdateStatus('closed')}>
            Close Ticket
          </Button>
        )}
      </div>

      <div className="grid lg:grid-cols-[1fr,320px] gap-8">
        <div className="space-y-6">
          {/* Main Description */}
          <Card>
            <CardHeader className="pb-3 border-b bg-muted/5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <UserCircle2 className="w-4 h-4" />
                <span className="font-semibold text-foreground">{ticket.creatorUsername}</span>
                <span>reported this</span>
                <span title={format(new Date(ticket.createdAt), "PPpp")}>{formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}</span>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="prose dark:prose-invert max-w-none text-sm whitespace-pre-wrap">
                {ticket.description}
              </div>
            </CardContent>
          </Card>

          {/* Activity Timeline */}
          <div className="space-y-4">
            <h3 className="font-semibold flex items-center gap-2 text-lg px-1 mt-8 mb-4">
              <History className="w-5 h-5 text-primary" />
              Activity Feed
            </h3>

            <div className="space-y-4">
              {comments.map(comment => {
                if (comment.isSystem) {
                  return (
                    <div key={comment.id} className="bg-muted/30 border border-muted py-2 px-4 rounded flex items-center justify-between text-xs text-muted-foreground ml-6">
                      <span className="italic flex items-center gap-2"><Clock className="w-3 h-3" /> {comment.content}</span>
                      <span title={format(new Date(comment.createdAt), "PPpp")}>{formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}</span>
                    </div>
                  );
                }

                return (
                  <div key={comment.id} className={`flex gap-4 ${comment.isInternal ? 'bg-orange-500/10 border border-orange-500/20 p-4 rounded-lg' : ''}`}>
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm">{comment.authorUsername}</span>
                        {comment.authorRole === 'owner' && <Badge variant="destructive" className="h-4 text-[9px] px-1">OWNER</Badge>}
                        <span className="text-xs text-muted-foreground" title={format(new Date(comment.createdAt), "PPpp")}>
                          {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                        </span>
                        {comment.isInternal && <Badge variant="outline" className="h-4 text-[9px] px-1 bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400 border-none font-bold ml-auto">INTERNAL</Badge>}
                      </div>
                      <div className="text-sm whitespace-pre-wrap mt-1">
                        {comment.content}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Comment Form */}
            {ticket.status !== 'closed' && (
              <div className="mt-8 border rounded-lg overflow-hidden focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-all">
                <Textarea 
                  className="border-0 focus-visible:ring-0 rounded-none bg-muted/5 p-4 min-h-[120px]"
                  placeholder={t("comments.placeholder")}
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                />
                <div className="bg-muted/20 border-t p-3 flex items-center justify-between">
                  <div>
                    {isOwner && (
                      <div className="flex items-center gap-2">
                        <Switch id="internal-mode" checked={isInternal} onCheckedChange={setIsInternal} />
                        <Label htmlFor="internal-mode" className="text-xs font-semibold cursor-pointer select-none text-orange-600 dark:text-orange-400">Internal Note</Label>
                      </div>
                    )}
                  </div>
                  <Button disabled={!commentText.trim() || isAddingComment} onClick={handleCommentSubmit} size="sm" className="font-bold">
                    {isAddingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : "Post Reply"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div>
          <Card className="sticky top-24">
            <CardHeader className="pb-4 border-b">
              <CardTitle className="text-sm">Ticket Properties</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4 text-sm">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-semibold">Status</label>
                {isOwner ? (
                  <Select value={ticket.status} onValueChange={handleUpdateStatus} disabled={isUpdating}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['open', 'in_progress', 'on_hold', 'resolved', 'closed'].map(s => (
                        <SelectItem key={s} value={s}>{t(`status.${s}`, s)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="h-8 flex items-center"><TicketStatusBadge status={ticket.status} /></div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-semibold">Priority</label>
                {isOwner ? (
                  <Select value={ticket.priority} onValueChange={handleUpdatePriority} disabled={isUpdating}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['low', 'medium', 'high', 'critical'].map(p => (
                        <SelectItem key={p} value={p}>{t(`priority.${p}`, p)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="h-8 flex items-center"><TicketPriorityBadge priority={ticket.priority} /></div>
                )}
              </div>

              <div className="pt-4 border-t space-y-3">
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground font-semibold">Type</span>
                  <span className="text-xs font-medium">{t(`types.${ticket.type}`, ticket.type)}</span>
                </div>
                
                {ticket.relatedUrl && (
                  <div className="flex justify-between items-start gap-4">
                    <span className="text-xs text-muted-foreground font-semibold shrink-0">Related Link</span>
                    <a href={ticket.relatedUrl} target="_blank" rel="noreferrer" className="text-xs truncate text-primary hover:underline">{ticket.relatedUrl}</a>
                  </div>
                )}
                
                <div className="flex flex-col items-start pt-2 space-y-1.5">
                  <span className="text-xs text-muted-foreground font-semibold">Assigned</span>
                  {isOwner ? (
                    <Select value={ticket.assignedTo ? String(ticket.assignedTo) : "unassigned"} onValueChange={(v) => handleUpdateAssignment(v === "unassigned" ? null : parseInt(v))} disabled={isUpdating}>
                      <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {staffUsers.map(admin => (
                          <SelectItem key={admin.id} value={String(admin.id)}>
                            {admin.username} ({admin.role})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className={`text-xs font-medium ${ticket.assignedTo ? '' : 'text-orange-500 italic'}`}>{ticket.assignedTo ? 'Owner (ID: ' + ticket.assignedTo + ')' : 'Unassigned'}</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
