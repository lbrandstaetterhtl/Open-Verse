import { randomInt } from "node:crypto";
import { storage } from "../storage";
import { notificationService } from "./notification-service";
import { logger } from "../logger";

// Ticket references without 0/O/1/I/L (easy to read out and type)
const TICKET_REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const TICKET_REF_LENGTH = 6;

/** The name staff appear under for people who are not staff (no account name, no id). */
const SUPPORT_NAME = "Support";
const isStaffRole = (role: unknown) => role === "admin" || role === "owner";

/** Ticket columns a ticket's creator (not staff) gets: no assignee id, no internal timing metrics. */
function ticketForCreator(ticket: any) {
  if (!ticket) return ticket;
  const {
    assignedTo, responseTimeSeconds: _r, resolutionTimeSeconds: _s, firstResponseAt: _f, deletedAt: _d,
    ...rest
  } = ticket;
  return { ...rest, assignedTo: assignedTo ? true : null, assigned: !!assignedTo };
}

/** A ticket comment as the creator sees it: staff replies under the support name, no staff ids or names. */
function commentForCreator(comment: any, viewerId: number) {
  const own = comment.authorId === viewerId;
  const staff = !own && (isStaffRole(comment.authorRole) || isStaffRole(comment.author_role));
  const out: any = { ...comment };
  delete out.author_username; delete out.author_role; delete out.author_verified;
  if (comment.isSystem) {
    out.authorId = null;
    out.authorUsername = SUPPORT_NAME;
    out.authorRole = "staff";
    if (comment.changeType === "assignment_change") {
      // "Assigned to: <staff account>" → "Assigned to: Support" / "Assignment removed"
      const unassigned = !comment.changeTo || comment.changeTo === "Unassigned";
      out.changeType = unassigned ? "unassigned" : "assignment_change";
      out.changeFrom = null;
      out.changeTo = unassigned ? null : SUPPORT_NAME;
      out.content = unassigned ? "Assignment removed" : `Assigned to: ${SUPPORT_NAME}`;
    }
  } else if (staff || !own) {
    out.authorId = null;
    out.authorUsername = SUPPORT_NAME;
    out.authorRole = "staff";
    out.authorVerified = null;
  }
  return out;
}

/** Status history as the creator sees it: who changed it only when it was the creator themselves. */
function historyForCreator(entry: any, viewerId: number) {
  const own = entry.changedBy === viewerId;
  const { changed_by_username: _u, ...rest } = entry;
  return { ...rest, changedBy: own ? entry.changedBy : null, changedByUsername: own ? entry.changedByUsername : SUPPORT_NAME };
}

export const TicketService = {
  /**
   * GENERATE TICKET NUMBER — TKT-<year>-<6 random characters>. Not a counter: the reference must not tell
   * how many tickets there are. Existing sequential numbers stay as they are. Collisions (unique column)
   * are retried by createTicket.
   */
  async generateTicketNumber(_attempt = 0): Promise<string> {
    const year = new Date().getFullYear();
    let ref = "";
    for (let i = 0; i < TICKET_REF_LENGTH; i++) ref += TICKET_REF_ALPHABET[randomInt(TICKET_REF_ALPHABET.length)];
    return `TKT-${year}-${ref}`;
  },

  /**
   * What a viewer gets of a ticket answer ({ ticket, comments, history }) or a list of tickets: staff
   * (owner / "tickets" permission) everything, the creator no staff identities or internal metrics.
   */
  viewFor<T>(data: T, canSeeAll: boolean, viewerId: number): T {
    if (canSeeAll || !data) return data;
    const d: any = data;
    if (Array.isArray(d)) return d.map((t: any) => ticketForCreator(t)) as any;
    if (Array.isArray(d.tickets) && !d.ticket) return { ...d, tickets: d.tickets.map((t: any) => ticketForCreator(t)) };
    return {
      ...d,
      ticket: ticketForCreator(d.ticket),
      comments: Array.isArray(d.comments) ? d.comments.map((c: any) => commentForCreator(c, viewerId)) : d.comments,
      history: Array.isArray(d.history) ? d.history.map((h: any) => historyForCreator(h, viewerId)) : d.history,
    };
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
      // Filtering by assignee would tell which staff account handles a ticket
      delete storeFilters.assignedTo;
    }
    const limit = filters.limit || 20;
    const page = filters.page || 1;
    storeFilters.limit = limit;
    storeFilters.offset = (page - 1) * limit;

    const supportStore = await storage.getSupportStore();
    const { tickets, total } = await supportStore.getTickets(storeFilters);

    return this.viewFor({
      tickets,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    }, canSeeAll, userId);
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

    return this.viewFor({ ticket, comments, history }, canSeeAll, userId);
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

    // The creator's view (createTicket is only called for the caller's own new ticket)
    return this.getTicketById(ticket.id, "user", userId, false);
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
    // First response time: the first visible staff reply to someone else's ticket (internal notes don't count)
    if (ticket && !ticket.resolvedAt && !isInternal && authorId !== ticket.createdBy && ticket.responseTimeSeconds == null) {
        const author = await storage.getUser(authorId);
        if (author && (author.role === 'admin' || author.role === 'owner')) {
             if (ticket.createdAt) {
                 const now = new Date();
                 const responseTime = Math.floor((now.getTime() - ticket.createdAt.getTime()) / 1000);
                 await supportStore.updateTicket(ticketId, { responseTimeSeconds: responseTime });
             }
        }
    }

    // Notify ticket creator (a system notification: it does not name the staff member)
    if (ticket && ticket.createdBy !== authorId && !isInternal) {
      notificationService.notify({
        userId: ticket.createdBy,
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
