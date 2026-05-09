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
import { cn } from "@/lib/utils";

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
    <div className="container max-w-6xl mx-auto py-12 px-4 pt-24 pb-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <BackButton fallback="/tickets" className="mb-10 -ml-4 font-black uppercase tracking-widest text-[10px] opacity-60 hover:opacity-100 hover:-translate-x-2 transition-all" />

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-8 mb-12 border-b border-white/5 pb-10 relative overflow-hidden">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <span className="font-mono text-[10px] font-black tracking-widest text-primary/60 bg-primary/5 px-3 py-1 rounded-full border border-primary/10">#{ticket.ticketNumber}</span>
              <TicketStatusBadge status={ticket.status} />
              <TicketPriorityBadge priority={ticket.priority} />
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase italic italic-primary leading-[0.9]">{ticket.title}</h1>
          </div>
          <div className="flex gap-4 w-full lg:w-auto">
            {isOwner && ticket.status !== 'closed' && (
              <Button variant="destructive" disabled={isUpdating || isDeleting} className="h-14 px-8 rounded-full font-black uppercase tracking-widest text-[10px] shadow-xl shadow-red-500/20" onClick={async () => {
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
                {isDeleting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Decommission Signal"}
              </Button>
            )}
            {(!isOwner && ticket.status !== 'closed') && (
              <Button variant="destructive" disabled={isUpdating} className="h-14 px-8 rounded-full font-black uppercase tracking-widest text-[10px] shadow-xl shadow-red-500/20" onClick={() => handleUpdateStatus('closed')}>
                Deactivate Transmission
              </Button>
            )}
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr,350px] gap-12">
          <div className="space-y-10">
            {/* Main Description */}
            <Card className="glass-premium border-white/10 shadow-2xl overflow-hidden group">
              <div className="absolute inset-0 nebula-banner opacity-5 group-hover:opacity-10 transition-opacity duration-1000" />
              <CardHeader className="relative z-10 p-8 pb-4 border-b border-white/5 bg-white/5">
                <div className="flex items-center gap-4 text-xs font-bold">
                  <UserCircle2 className="w-5 h-5 text-primary" />
                  <span className="text-foreground">{ticket.creatorUsername}</span>
                  <span className="opacity-40 font-medium">initiated signal</span>
                  <span className="opacity-40 font-medium ml-auto" title={format(new Date(ticket.createdAt), "PPpp")}>{formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}</span>
                </div>
              </CardHeader>
              <CardContent className="relative z-10 p-10">
                <div className="prose dark:prose-invert max-w-none text-base font-medium leading-relaxed opacity-90 whitespace-pre-wrap">
                  {ticket.description}
                </div>
              </CardContent>
            </Card>

            {/* Activity Timeline */}
            <div className="space-y-8">
              <div className="flex items-center justify-between px-2">
                <h3 className="font-black uppercase tracking-[0.3em] text-[10px] text-primary flex items-center gap-3">
                  <History className="w-4 h-4" />
                  Transmission History
                </h3>
              </div>

              <div className="space-y-6">
                {comments.map(comment => {
                  if (comment.isSystem) {
                    return (
                      <div key={comment.id} className="relative flex items-center gap-4 px-6 py-3 rounded-full glass-premium border-white/5 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-8 group">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
                        <span className="italic truncate">{comment.content}</span>
                        <span className="ml-auto opacity-40 shrink-0" title={format(new Date(comment.createdAt), "PPpp")}>{formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}</span>
                      </div>
                    );
                  }

                  return (
                    <div key={comment.id} className={cn(
                      "group relative flex gap-6 p-8 rounded-[2.5rem] transition-all duration-500",
                      comment.isInternal ? "glass-premium border-orange-500/20 bg-orange-500/5" : "glass-premium border-white/5 hover:border-white/10"
                    )}>
                      <div className="relative">
                        <div className="w-12 h-12 rounded-2xl glass-premium border-white/10 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-500">
                          <User className="w-6 h-6 text-primary" />
                        </div>
                        {comment.authorRole === 'owner' && <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 border-2 border-background animate-pulse" />}
                      </div>
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-3">
                          <span className="font-black uppercase tracking-widest text-[11px]">{comment.authorUsername}</span>
                          {comment.authorRole === 'owner' && <Badge variant="destructive" className="h-4 text-[8px] font-black tracking-widest px-2">COMMANDER</Badge>}
                          <span className="text-[10px] font-bold opacity-40" title={format(new Date(comment.createdAt), "PPpp")}>
                            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                          </span>
                          {comment.isInternal && <Badge variant="outline" className="h-4 text-[8px] font-black tracking-widest px-2 bg-orange-500/20 text-orange-400 border-none ml-auto">INTERNAL SIGNAL</Badge>}
                        </div>
                        <div className="text-[15px] font-medium leading-relaxed opacity-80 whitespace-pre-wrap">
                          {comment.content}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Comment Form */}
              {ticket.status !== 'closed' && (
                <div className="mt-12 glass-premium border-white/10 rounded-[3rem] overflow-hidden focus-within:ring-2 focus-within:ring-primary/20 transition-all shadow-2xl group">
                  <div className="absolute inset-0 nebula-banner opacity-5 pointer-events-none" />
                  <Textarea 
                    className="relative z-10 border-0 focus-visible:ring-0 rounded-none bg-transparent p-10 min-h-[160px] font-medium text-base resize-none"
                    placeholder={t("comments.placeholder", "Inject your response into the transmission...")}
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                  />
                  <div className="relative z-10 bg-white/5 border-t border-white/5 p-6 px-10 flex flex-col sm:flex-row items-center justify-between gap-6">
                    <div>
                      {isOwner && (
                        <div className="flex items-center gap-4">
                          <Switch id="internal-mode" checked={isInternal} onCheckedChange={setIsInternal} className="data-[state=checked]:bg-orange-500" />
                          <Label htmlFor="internal-mode" className="text-[10px] font-black uppercase tracking-widest cursor-pointer select-none text-orange-400">Secure Internal Channel</Label>
                        </div>
                      )}
                    </div>
                    <Button disabled={!commentText.trim() || isAddingComment} onClick={handleCommentSubmit} className="h-14 px-10 rounded-full font-black uppercase tracking-widest text-[10px] shadow-2xl shadow-primary/30 nebula-glow w-full sm:w-56">
                      {isAddingComment ? <Loader2 className="w-5 h-5 animate-spin" /> : "Transmit Response"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            <Card className="glass-premium border-white/10 shadow-2xl sticky top-28 overflow-hidden group">
              <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
              <CardHeader className="p-8 pb-4 border-b border-white/5 relative z-10">
                <CardTitle className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Signal Core</CardTitle>
              </CardHeader>
              <CardContent className="p-8 space-y-8 relative z-10">
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground pl-1">Status Phase</label>
                  {isOwner ? (
                    <Select value={ticket.status} onValueChange={handleUpdateStatus} disabled={isUpdating}>
                      <SelectTrigger className="h-12 rounded-full glass-input border-white/5 font-bold text-xs uppercase tracking-widest">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="glass-premium border-white/10">
                        {['open', 'in_progress', 'on_hold', 'resolved', 'closed'].map(s => (
                          <SelectItem key={s} value={s} className="font-bold text-xs uppercase tracking-widest">{t(`status.${s}`, s)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="h-10 flex items-center pl-1"><TicketStatusBadge status={ticket.status} /></div>
                  )}
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground pl-1">Priority Level</label>
                  {isOwner ? (
                    <Select value={ticket.priority} onValueChange={handleUpdatePriority} disabled={isUpdating}>
                      <SelectTrigger className="h-12 rounded-full glass-input border-white/5 font-bold text-xs uppercase tracking-widest">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="glass-premium border-white/10">
                        {['low', 'medium', 'high', 'critical'].map(p => (
                          <SelectItem key={p} value={p} className="font-bold text-xs uppercase tracking-widest">{t(`priority.${p}`, p)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="h-10 flex items-center pl-1"><TicketPriorityBadge priority={ticket.priority} /></div>
                  )}
                </div>

                <div className="pt-8 border-t border-white/5 space-y-5">
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Type</span>
                    <span className="text-xs font-black uppercase tracking-widest text-foreground">{t(`types.${ticket.type}`, ticket.type)}</span>
                  </div>
                  
                  {ticket.relatedUrl && (
                    <div className="flex flex-col gap-2 px-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Related Signal</span>
                      <a href={ticket.relatedUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary hover:text-accent truncate transition-colors drop-shadow-sm">{ticket.relatedUrl}</a>
                    </div>
                  )}
                  
                  <div className="flex flex-col gap-3 px-1 pt-4 border-t border-white/5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Assigned Personnel</span>
                    {isOwner ? (
                      <Select value={ticket.assignedTo ? String(ticket.assignedTo) : "unassigned"} onValueChange={(v) => handleUpdateAssignment(v === "unassigned" ? null : parseInt(v))} disabled={isUpdating}>
                        <SelectTrigger className="h-12 rounded-full glass-input border-white/5 font-bold text-xs uppercase tracking-widest">
                          <SelectValue placeholder="Select Staff" />
                        </SelectTrigger>
                        <SelectContent className="glass-premium border-white/10">
                          <SelectItem value="unassigned" className="font-bold text-xs uppercase tracking-widest">Awaiting Pilot</SelectItem>
                          {staffUsers.map(admin => (
                            <SelectItem key={admin.id} value={String(admin.id)} className="font-bold text-xs uppercase tracking-widest">
                              {admin.username}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className={cn("h-8 px-4 rounded-full flex items-center text-[9px] font-black uppercase tracking-widest", ticket.assignedTo ? "bg-primary/10 text-primary" : "bg-orange-500/10 text-orange-400 border border-orange-500/20 animate-pulse")}>
                          {ticket.assignedTo ? 'Personnel Active' : 'Awaiting Pilot'}
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
