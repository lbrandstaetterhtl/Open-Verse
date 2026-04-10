import { db, getSqlite } from "../db";
import {
  tickets,
  ticketComments,
  ticketStatusHistory,
  type Ticket,
  type InsertTicket,
  type TicketComment,
  type TicketStatusHistory,
} from "@shared/schema";
import { eq, desc, and, or, sql, like } from "drizzle-orm";
import { notificationService } from "./notification-service";

export class TicketService {
  /** GENERATE TICKET NUMBER */
  static async generateTicketNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `TKT-${year}-`;


    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const lastTicket = sqlite
        .prepare(`SELECT ticket_number FROM tickets WHERE ticket_number LIKE ? ORDER BY id DESC LIMIT 1`)
        .get(`${prefix}%`) as { ticket_number: string } | undefined;

      let nextNumber = 1;
      if (lastTicket) {
        const lastNumber = parseInt(lastTicket.ticket_number.split("-")[2]);
        nextNumber = lastNumber + 1;
      }
      return `${prefix}${String(nextNumber).padStart(4, "0")}`;
    }

    // Postgres fallback
    const lastTicket = await db
      .select({ ticketNumber: tickets.ticketNumber })
      .from(tickets)
      .where(like(tickets.ticketNumber, `${prefix}%`))
      .orderBy(desc(tickets.id))
      .limit(1)
      .then((res) => res[0]);

    let nextNumber = 1;
    if (lastTicket) {
      const lastNumber = parseInt(lastTicket.ticketNumber.split("-")[2]);
      nextNumber = lastNumber + 1;
    }
    return `${prefix}${String(nextNumber).padStart(4, "0")}`;
  }

  /** GET TICKETS */
  static async getTickets(
    userRole: string,
    userId: number,
    filters: {
      status?: string;
      priority?: string;
      type?: string;
      assignedTo?: number;
      createdBy?: number;
      sortBy?: string;
      search?: string;
      page?: number;
      limit?: number;
    }
  ) {

    
    const isAdminOrOwner = userRole === "owner" || userRole === "admin";
    
    let whereClause = isAdminOrOwner ? `1=1` : `t.created_by = ${userId}`;
    const params: any[] = [];

    if (filters.status) {
      whereClause += ` AND t.status = ?`;
      params.push(filters.status);
    }
    if (filters.priority) {
      whereClause += ` AND t.priority = ?`;
      params.push(filters.priority);
    }
    if (filters.type) {
      whereClause += ` AND t.type = ?`;
      params.push(filters.type);
    }
    if (filters.assignedTo) {
      whereClause += ` AND t.assigned_to = ?`;
      params.push(filters.assignedTo);
    }
    if (filters.search) {
      whereClause += ` AND (t.title LIKE ? OR t.description LIKE ? OR t.ticket_number LIKE ?)`;
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }
    if (filters.createdBy) {
      whereClause += ` AND t.created_by = ?`;
      params.push(filters.createdBy);
    }

    // Soft delete filter
    whereClause += ` AND t.deleted_at IS NULL`;

    const limit = filters.limit || 20;
    const page = filters.page || 1;
    const offset = (page - 1) * limit;

    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const countRow = sqlite
        .prepare(`SELECT COUNT(*) as total FROM tickets t WHERE ${whereClause}`)
        .get(...params) as { total: number };
      
      const total = countRow.total;

      let orderBy = `ORDER BY t.created_at DESC`;
      if (filters.sortBy === 'newest') orderBy = `ORDER BY t.created_at DESC`;
      if (filters.sortBy === 'oldest') orderBy = `ORDER BY t.created_at ASC`;
      if (filters.sortBy === 'updated') orderBy = `ORDER BY t.updated_at DESC`;
      if (filters.sortBy === 'priority') orderBy = `ORDER BY CASE t.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END, t.created_at DESC`;

      const rows = sqlite
        .prepare(`
          SELECT t.*, u.username as creator_username
          FROM tickets t
          LEFT JOIN users u ON t.created_by = u.id
          WHERE ${whereClause}
          ${orderBy}
          LIMIT ? OFFSET ?
        `)
        .all(...params, limit, offset);

      return {
        tickets: rows.map(this.mapSqliteRow.bind(this)),
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    }
    
    // Not implementing full PG fallback here as the app mandates SQLite structure primarily,
    // but Drizzle standardizes it if needed. 
    return { tickets: [], total: 0, page: 1, totalPages: 1 };
  }

  /** GET STATS */
  static async getStats() {

    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite.prepare(`SELECT status, priority, type, created_at, resolved_at FROM tickets WHERE deleted_at IS NULL`).all() as any[];
      
      let total = rows.length;
      let by_status: any = { open: 0, in_progress: 0, on_hold: 0, resolved: 0, closed: 0 };
      let by_priority: any = { low: 0, medium: 0, high: 0, critical: 0 };
      let by_type: any = {};
      let open_critical = 0;
      let totalResolutionTime = 0;
      let resolvedCount = 0;

      rows.forEach(r => {
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
    }
    return null;
  }

  /** GET TICKET BY ID */
  static async getTicketById(id: number, userRole: string, userId: number) {

    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const ticketRow = sqlite.prepare(`
        SELECT t.*, u.username as creator_username
        FROM tickets t
        LEFT JOIN users u ON t.created_by = u.id
        WHERE t.id = ? AND t.deleted_at IS NULL
      `).get(id) as any;

      if (!ticketRow) return null;

      if (userRole !== "owner" && userRole !== "admin" && ticketRow.created_by !== userId) {
        return null; // Not allowed
      }

      const commentCondition = userRole === "owner" ? "" : " AND c.is_internal = 0";
      const comments = sqlite.prepare(`
        SELECT c.*, u.username as author_username, u.role as author_role, u.verified as author_verified
        FROM ticket_comments c
        LEFT JOIN users u ON c.author_id = u.id
        WHERE c.ticket_id = ? AND c.deleted_at IS NULL ${commentCondition}
        ORDER BY c.created_at ASC
      `).all(id);

      const history = sqlite.prepare(`
        SELECT h.*, u.username as changed_by_username
        FROM ticket_status_history h
        LEFT JOIN users u ON h.changed_by = u.id
        WHERE h.ticket_id = ?
        ORDER BY h.created_at ASC
      `).all(id);

      return {
        ticket: this.mapSqliteRow(ticketRow),
        comments: comments.map((c: any) => ({
          ...c,
          createdAt: new Date(c.created_at * 1000),
          updatedAt: new Date(c.updated_at * 1000),
          isSystem: Boolean(c.is_system),
          isInternal: Boolean(c.is_internal)
        })),
        history: history.map((h: any) => ({
          ...h,
          createdAt: new Date(h.created_at * 1000)
        }))
      };
    }
    return null;
  }

  /** CREATE TICKET */
  static async createTicket(data: any, userId: number) {

    const ticketNumber = await this.generateTicketNumber();
    
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const now = Math.floor(Date.now() / 1000);
      const info = sqlite.prepare(`
        INSERT INTO tickets (
          ticket_number, created_by, type, priority, title, description,
          related_user_id, related_post_id, related_url, tags, attachments, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        ticketNumber, userId, data.type, data.priority, data.title, data.description,
        data.relatedUserId || null, data.relatedPostId || null, data.relatedUrl || null,
        data.tags || '[]', data.attachments || '[]', now, now
      );

      await this.createSystemComment(info.lastInsertRowid as number, userId, 'created', null, 'open');

      return await this.getTicketById(info.lastInsertRowid as number, "owner", userId);
    }
    return null;
  }

  /** UPDATE TICKET */
  static async updateTicket(id: number, data: any, userId: number) {

    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const current = sqlite.prepare(`SELECT * FROM tickets WHERE id = ?`).get(id) as any;
      if (!current) return null;

      const updates: string[] = [];
      const params: any[] = [];

      if (data.status && data.status !== current.status) {
        updates.push("status = ?"); params.push(data.status);
        if (data.status === 'resolved') {
          updates.push("resolved_at = ?"); params.push(Math.floor(Date.now() / 1000));
        } else if (data.status === 'closed') {
          updates.push("closed_at = ?"); params.push(Math.floor(Date.now() / 1000));
        }
      }

      if (data.priority && data.priority !== current.priority) {
        updates.push("priority = ?"); params.push(data.priority);
      }

      if (data.assignedTo !== undefined) {
        updates.push("assigned_to = ?"); params.push(data.assignedTo);
      }

      if (updates.length > 0) {
        updates.push("updated_at = ?"); params.push(Math.floor(Date.now() / 1000));
        const setClause = updates.join(", ");
        sqlite.prepare(`UPDATE tickets SET ${setClause} WHERE id = ?`).run(...params, id);

        // System Comments and History
        if (data.status && data.status !== current.status) {
          sqlite.prepare(`
            INSERT INTO ticket_status_history (ticket_id, changed_by, from_status, to_status, reason, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(id, userId, current.status, data.status, data.reason || null, Math.floor(Date.now() / 1000));

          await this.createSystemComment(id, userId, 'status_change', current.status, data.status);
        }

        if (data.priority && data.priority !== current.priority) {
          await this.createSystemComment(id, userId, 'priority_change', current.priority, data.priority);
        }

        if (data.assignedTo !== undefined && data.assignedTo !== current.assigned_to) {
          let assigneeName = "Unassigned";
          if (data.assignedTo) {
            const assigneeRow = sqlite.prepare(`SELECT username FROM users WHERE id = ?`).get(data.assignedTo) as any;
            if (assigneeRow) assigneeName = assigneeRow.username;
          }
          await this.createSystemComment(id, userId, 'assignment_change', null, assigneeName);
        }
      }

      return true;
    }
    return false;
  }

  /** DELETE TICKET */
  static async deleteTicket(id: number) {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare(`UPDATE tickets SET deleted_at = ? WHERE id = ?`).run(Math.floor(Date.now() / 1000), id);
      return true;
    }
    return false;
  }

  /** CREATE COMMENT */
  static async addComment(ticketId: number, authorId: number, content: string, isInternal: boolean) {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const now = Math.floor(Date.now() / 1000);
      const res = sqlite.prepare(`
        INSERT INTO ticket_comments (ticket_id, author_id, content, is_internal, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(ticketId, authorId, content, isInternal ? 1 : 0, now, now);

      sqlite.prepare(`UPDATE tickets SET updated_at = ? WHERE id = ?`).run(now, ticketId);

      // Notify ticket creator
      const ticket = sqlite.prepare(`SELECT created_by, title, ticket_number FROM tickets WHERE id = ?`).get(ticketId) as any;
      if (ticket && ticket.created_by !== authorId && !isInternal) {
        notificationService.notify({
          userId: ticket.created_by,
          actorId: authorId,
          type: "system_announcement",
          title: "New Ticket Reply",
          message: `There is a new reply on your ticket: ${ticket.ticket_number} - ${ticket.title}`,
          actionUrl: `/tickets/${ticketId}`,
        }).catch(err => console.error("[TicketService] Failed to notify ticket creator:", err));
      }
      
      return res.lastInsertRowid;
    }
    return null;
  }

  /** EDIT COMMENT */
  static async editComment(commentId: number, authorId: number, userRole: string, content: string) {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const current = sqlite.prepare(`SELECT * FROM ticket_comments WHERE id = ? AND is_system = 0`).get(commentId) as any;
      if (!current) return false;
      if (current.author_id !== authorId && userRole !== 'owner') return false; // Only owner or author
      
      const now = Math.floor(Date.now() / 1000);
      sqlite.prepare(`UPDATE ticket_comments SET content = ?, updated_at = ? WHERE id = ?`).run(content, now, commentId);
      return true;
    }
    return false;
  }

  /** DELETE COMMENT */
  static async deleteComment(commentId: number, authorId: number, userRole: string) {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const current = sqlite.prepare(`SELECT * FROM ticket_comments WHERE id = ? AND is_system = 0`).get(commentId) as any;
      if (!current) return false;
      if (current.author_id !== authorId && userRole !== 'owner') return false;
      
      const now = Math.floor(Date.now() / 1000);
      sqlite.prepare(`UPDATE ticket_comments SET deleted_at = ? WHERE id = ?`).run(now, commentId);
      return true;
    }
    return false;
  }

  /** RESTORE TICKET */
  static async restoreTicket(ticketId: number) {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare(`UPDATE tickets SET deleted_at = NULL WHERE id = ?`).run(ticketId);
      return true;
    }
    return false;
  }

  /** GET HISTORY ONLY */
  static async getHistory(ticketId: number) {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const history = sqlite.prepare(`
        SELECT h.*, u.username as changed_by_username
        FROM ticket_status_history h
        LEFT JOIN users u ON h.changed_by = u.id
        WHERE h.ticket_id = ?
        ORDER BY h.created_at ASC
      `).all(ticketId);
      
      return history.map((h: any) => ({
        ...h,
        createdAt: new Date(h.created_at * 1000)
      }));
    }
    return [];
  }

  /** SYSTEM COMMENT */
  private static async createSystemComment(
    ticketId: number,
    authorId: number,
    changeType: 'status_change' | 'priority_change' | 'assignment_change' | 'created',
    from: string | null,
    to: string
  ): Promise<void> {
    const messages: Record<string, string> = {
      created:           `Ticket created`,
      status_change:     `Status changed: ${from} → ${to}`,
      priority_change:   `Priority changed: ${from} → ${to}`,
      assignment_change: `Assigned to: ${to}`,
    };

    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const now = Math.floor(Date.now() / 1000);
      sqlite.prepare(`
        INSERT INTO ticket_comments (
          ticket_id, author_id, content, is_system, is_internal,
          change_type, change_from, change_to, created_at, updated_at
        ) VALUES (?, ?, ?, 1, 0, ?, ?, ?, ?, ?)
      `).run(ticketId, authorId, messages[changeType], changeType, from, to, now, now);
    }
  }

  private static mapSqliteRow(row: any) {
    return {
      ...row,
      ticketNumber: row.ticket_number,
      createdBy: row.created_by,
      assignedTo: row.assigned_to,
      relatedUserId: row.related_user_id,
      relatedPostId: row.related_post_id,
      relatedUrl: row.related_url,
      createdAt: new Date(row.created_at * 1000),
      updatedAt: new Date(row.updated_at * 1000),
      resolvedAt: row.resolved_at ? new Date(row.resolved_at * 1000) : null,
      closedAt: row.closed_at ? new Date(row.closed_at * 1000) : null,
      deletedAt: row.deleted_at ? new Date(row.deleted_at * 1000) : null,
      tags: row.tags ? (typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags) : [],
      attachments: row.attachments ? (typeof row.attachments === 'string' ? JSON.parse(row.attachments) : row.attachments) : []
    };
  }
}
