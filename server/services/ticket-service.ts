import { storage } from "../storage";
import { notificationService } from "./notification-service";
import { logger } from "../logger";

export const TicketService = {
  /** GENERATE TICKET NUMBER */
  async generateTicketNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `TKT-${year}-`;

    const supportStore = await storage.getSupportStore();
    const result = await supportStore.getTickets({ search: prefix, limit: 1 });
    const lastTicket = result.tickets[0];

    let nextNumber = 1;
    if (lastTicket && lastTicket.ticketNumber.startsWith(prefix)) {
      const parts = lastTicket.ticketNumber.split("-");
      const lastNum = parseInt(parts.at(-1));
      if (!isNaN(lastNum)) nextNumber = lastNum + 1;
    }
    return `${prefix}${String(nextNumber).padStart(4, "0")}`;
  },

  /** GET TICKETS */
  async getTickets(
    userRole: string,
    userId: number,
    filters: any
  ) {
    const isAdminOrOwner = userRole === "owner" || userRole === "admin";
    
    const storeFilters = { ...filters };
    if (!isAdminOrOwner) {
      storeFilters.createdBy = userId;
    }

    const supportStore = await storage.getSupportStore();
    const { tickets, total } = await supportStore.getTickets(storeFilters);

    return {
      tickets,
      total,
      page: filters.page || 1,
      totalPages: Math.ceil(total / (filters.limit || 20))
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

      if (r.resolved_at && r.created_at) {
        totalResolutionTime += (r.resolved_at - r.created_at);
        resolvedCount++;
      }
    });

    const avg_resolution_time_hours = resolvedCount > 0 ? (totalResolutionTime / resolvedCount) / 3600 : 0;

    return { total, by_status, by_priority, by_type, open_critical, avg_resolution_time_hours: Math.round(avg_resolution_time_hours) };
  },

  /** GET TICKET BY ID */
  async getTicketById(id: number, userRole: string, userId: number) {
    const supportStore = await storage.getSupportStore();
    const ticket = await supportStore.getTicket(id);

    if (!ticket) return null;

    if (userRole !== "owner" && userRole !== "admin" && ticket.createdBy !== userId) {
      return null;
    }

    const comments = await supportStore.getComments(id, userRole);
    const history = await supportStore.getHistory(id);

    return { ticket, comments, history };
  },

  /** CREATE TICKET */
  async createTicket(data: any, userId: number) {
    const ticketNumber = await this.generateTicketNumber();
    const supportStore = await storage.getSupportStore();
    
    const ticket = await supportStore.createTicket({
      ...data,
      ticketNumber,
      createdBy: userId,
      status: 'open'
    });

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

  /** EDIT COMMENT */
  async editComment(commentId: number, _authorId: number, _userRole: string, content: string) {
    const supportStore = await storage.getSupportStore();
    // Simplified: in reality we'd check author here or in the route
    return supportStore.updateComment(commentId, content);
  },

  /** DELETE COMMENT */
  async deleteComment(commentId: number, _authorId: number, _userRole: string) {
    const supportStore = await storage.getSupportStore();
    return supportStore.deleteComment(commentId);
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
