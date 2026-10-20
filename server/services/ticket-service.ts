import { storage } from "../storage";
import { notificationService } from "./notification-service";
import { logger } from "../logger";

export const TicketService = {
  /**
   * GENERATE TICKET NUMBER — the next number after the highest one of the year, counting soft-deleted
   * tickets too (they keep their unique ticket_number). `offset` skips numbers taken by a concurrent create.
   */
  async generateTicketNumber(offset = 0): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `TKT-${year}-`;

    const supportStore = await storage.getSupportStore();
    const last = await supportStore.getHighestTicketNumber(prefix);

    let nextNumber = 1;
    if (last && last.startsWith(prefix)) {
      const lastNum = parseInt(last.slice(prefix.length), 10);
      if (!isNaN(lastNum)) nextNumber = lastNum + 1;
    }
    return `${prefix}${String(nextNumber + offset).padStart(4, "0")}`;
  },

  /** GET TICKETS — `canSeeAll` (owner or the "tickets" permission) lists every ticket, everyone else only their own. */
  async getTickets(
    canSeeAll: boolean,
    userId: number,
    filters: any
  ) {
    const storeFilters = { ...filters };
    if (!canSeeAll) {
      storeFilters.createdBy = userId;
    }
    const limit = filters.limit || 20;
    const page = filters.page || 1;
    storeFilters.limit = limit;
    storeFilters.offset = (page - 1) * limit;

    const supportStore = await storage.getSupportStore();
    const { tickets, total } = await supportStore.getTickets(storeFilters);

    return {
      tickets,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  },

  /** GET STATS */
  async getStats() {
    const supportStore = await storage.getSupportStore();
    const rows = await supportStore.getStats();
    
    const total = rows.length;
    const by_status: any = { open: 0, in_progress: 0, on_hold: 0, resolved: 0, closed: 0 };
    const by_priority: any = { low: 0, medium: 0, high: 0, critical: 0 };
    const by_type: any = {};
    let open_critical = 0;
    let totalResolutionTime = 0;
    let resolvedCount = 0;

    rows.forEach((r: any) => {
      if (by_status[r.status] !== undefined) by_status[r.status]++;
      if (by_priority[r.priority] !== undefined) by_priority[r.priority]++;
      
      by_type[r.type] = (by_type[r.type] || 0) + 1;
      
      if (r.status !== 'closed' && r.status !== 'resolved' && r.priority === 'critical') {
        open_critical++;
      }

      // Postgres rows come as Date objects (resolvedAt/createdAt), SQLite rows as unix seconds.
      const resolved = r.resolvedAt ?? r.resolved_at;
      const created = r.createdAt ?? r.created_at;
      if (resolved && created) {
        const toSeconds = (v: any) => (v instanceof Date ? v.getTime() / 1000 : Number(v));
        const diff = toSeconds(resolved) - toSeconds(created);
        if (Number.isFinite(diff) && diff >= 0) {
          totalResolutionTime += diff;
          resolvedCount++;
        }
      }
    });

    const avg_resolution_time_hours = resolvedCount > 0 ? (totalResolutionTime / resolvedCount) / 3600 : 0;

    return { total, by_status, by_priority, by_type, open_critical, avg_resolution_time_hours: Math.round(avg_resolution_time_hours) };
  },

  /**
   * GET TICKET BY ID — null when it does not exist or the viewer may not see it. `canSeeAll`: owner or an
   * admin with the "tickets" permission; others only see tickets they created. Internal comments: owners only.
   */
  async getTicketById(id: number, userRole: string, userId: number, canSeeAll = userRole === "owner") {
    const supportStore = await storage.getSupportStore();
    const ticket = await supportStore.getTicket(id);

    if (!ticket) return null;

    if (!canSeeAll && ticket.createdBy !== userId) {
      return null;
    }

    const comments = await supportStore.getComments(id, userRole);
    const history = await supportStore.getHistory(id);

    return { ticket, comments, history };
  },

  /** CREATE TICKET — `data` holds only validated, client-editable fields (see routes/tickets.ts). */
  async createTicket(data: {
    title: string; description: string; type: string; priority: string;
    relatedUrl?: string | null; relatedUserId?: number | null; relatedPostId?: number | null;
  }, userId: number) {
    const supportStore = await storage.getSupportStore();

    let ticket: any;
    for (let attempt = 0; ; attempt++) {
      const ticketNumber = await this.generateTicketNumber(attempt);
      try {
        ticket = await supportStore.createTicket({
          title: data.title,
          description: data.description,
          type: data.type,
          priority: data.priority,
          relatedUrl: data.relatedUrl ?? null,
          relatedUserId: data.relatedUserId ?? null,
          relatedPostId: data.relatedPostId ?? null,
          ticketNumber,
          createdBy: userId,
          status: 'open'
        });
        break;
      } catch (err: any) {
        const unique = err?.code === "23505" || err?.cause?.code === "23505" || /UNIQUE constraint/i.test(String(err?.message));
        if (!unique || attempt >= 9) throw err; // two creates picked the same number: take the next one
      }
    }

    await this.createSystemComment(ticket.id, userId, 'created', null, 'open');

    return this.getTicketById(ticket.id, "owner", userId);
  },

  /** UPDATE TICKET */
  async updateTicket(id: number, data: any, userId: number) {
    const supportStore = await storage.getSupportStore();
    const current = await supportStore.getTicket(id);
    if (!current) return null;

    const updates: any = {};
    if (data.status && data.status !== current.status) {
      updates.status = data.status;
      if (data.status === 'resolved' || data.status === 'closed') {
        const now = new Date();
        const timestampField = data.status === 'resolved' ? "resolvedAt" : "closedAt";
        updates[timestampField] = now;
        updates.resolutionTimeSeconds = Math.floor((now.getTime() - current.createdAt.getTime()) / 1000);
      }
    }

    if (data.priority && data.priority !== current.priority) updates.priority = data.priority;
    if (data.assignedTo !== undefined) updates.assignedTo = data.assignedTo;
    if (data.relatedUrl !== undefined) updates.relatedUrl = data.relatedUrl;

    if (Object.keys(updates).length > 0) {
      await supportStore.updateTicket(id, updates);

      if (data.status && data.status !== current.status) {
        await supportStore.addHistory({
          ticketId: id,
          changedBy: userId,
          fromStatus: current.status,
          toStatus: data.status,
          reason: data.reason || null
        });
        await this.createSystemComment(id, userId, 'status_change', current.status, data.status);
      }

      if (data.priority && data.priority !== current.priority) {
        await this.createSystemComment(id, userId, 'priority_change', current.priority, data.priority);
      }

      if (data.assignedTo !== undefined && data.assignedTo !== current.assignedTo) {
        let assigneeName = "Unassigned";
        if (data.assignedTo) {
          const assignee = await storage.getUser(data.assignedTo);
          if (assignee) assigneeName = assignee.username;
        }
        await this.createSystemComment(id, userId, 'assignment_change', null, assigneeName);
      }
    }

    return true;
  },

  /** DELETE TICKET */
  async deleteTicket(id: number) {
    const supportStore = await storage.getSupportStore();
    return supportStore.deleteTicket(id);
  },

  /** CREATE COMMENT */
  async addComment(ticketId: number, authorId: number, content: string, isInternal: boolean) {
    const supportStore = await storage.getSupportStore();
    const commentId = await supportStore.addComment({
      ticketId, authorId, content, isInternal, isSystem: false
    });

    const ticket = await supportStore.getTicket(ticketId);
    if (ticket && !ticket.resolvedAt && authorId !== ticket.createdBy) {
        // Simple mod check
        const author = await storage.getUser(authorId);
        if (author && (author.role === 'admin' || author.role === 'owner')) {
             if (ticket.createdAt) {
                 const now = new Date();
                 const responseTime = Math.floor((now.getTime() - ticket.createdAt.getTime()) / 1000);
                 await supportStore.updateTicket(ticketId, { responseTimeSeconds: responseTime });
             }
        }
    }

    // Notify ticket creator
    if (ticket && ticket.createdBy !== authorId && !isInternal) {
      notificationService.notify({
        userId: ticket.createdBy,
        actorId: authorId,
        type: "system_announcement",
        title: "New Ticket Reply",
        message: `There is a new reply on your ticket: ${ticket.ticketNumber} - ${ticket.title}`,
        actionUrl: `/tickets/${ticketId}`,
      }).catch(err => logger.error('business', "Failed to notify ticket reply", err, { ticketId, creatorId: ticket.createdBy }));
    }
    
    return commentId;
  },

  /**
   * Whether `user` may edit/delete comment `commentId` of ticket `ticketId`: the comment must belong to that
   * ticket and not be a system entry; the author may change it, as may the owner or an admin with the
   * "tickets" permission (`isStaff`). Internal comments are only visible to — and changeable by — owners.
   * Returns "not_found" | "forbidden" | "ok".
   */
  async checkCommentAccess(ticketId: number, commentId: number, user: { id: number; role: string }, isStaff: boolean) {
    const supportStore = await storage.getSupportStore();
    const comment = await supportStore.getComment(commentId);
    if (!comment || comment.ticketId !== ticketId || comment.isSystem) return "not_found" as const;
    if (comment.isInternal && user.role !== "owner") return "not_found" as const;
    if (comment.authorId === user.id || isStaff) return "ok" as const;
    return "forbidden" as const;
  },

  /** EDIT COMMENT (access checked with checkCommentAccess) */
  async editComment(ticketId: number, commentId: number, content: string) {
    const supportStore = await storage.getSupportStore();
    return supportStore.updateComment(commentId, content, ticketId);
  },

  /** DELETE COMMENT (access checked with checkCommentAccess) */
  async deleteComment(ticketId: number, commentId: number) {
    const supportStore = await storage.getSupportStore();
    return supportStore.deleteComment(commentId, ticketId);
  },

  /** RESTORE TICKET */
  async restoreTicket(ticketId: number) {
    const supportStore = await storage.getSupportStore();
    return supportStore.restoreTicket(ticketId);
  },

  /** SYSTEM COMMENT */
  async createSystemComment(
    ticketId: number,
    authorId: number,
    changeType: string,
    from: string | null,
    to: string
  ): Promise<void> {
    const messages: Record<string, string> = {
      created:           `Ticket created`,
      status_change:     `Status changed: ${from} → ${to}`,
      priority_change:   `Priority changed: ${from} → ${to}`,
      assignment_change: `Assigned to: ${to}`,
    };

    const supportStore = await storage.getSupportStore();
    await supportStore.addComment({
      ticketId, authorId, content: messages[changeType] || "System action",
      isSystem: true, isInternal: false,
      changeType, changeFrom: from, changeTo: to
    });
  }
};
