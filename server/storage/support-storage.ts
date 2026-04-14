import type {
  Ticket} from "@shared/schema";
import {
  tickets,
} from "@shared/schema";
import { db, getSqlite } from "../db";
import { eq, and, sql } from "drizzle-orm";

export class SupportStorage {
  async createTicket(ticket: any): Promise<Ticket> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const now = Math.floor(Date.now() / 1000);
      const info = sqlite.prepare(`
        INSERT INTO tickets (
          ticket_number, created_by, type, priority, title, description,
          related_user_id, related_post_id, related_url, tags, attachments, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        ticket.ticketNumber, ticket.createdBy, ticket.type, ticket.priority, ticket.title, ticket.description,
        ticket.relatedUserId || null, ticket.relatedPostId || null, ticket.relatedUrl || null,
        JSON.stringify(ticket.tags || []), JSON.stringify(ticket.attachments || []), ticket.status || 'open', now, now
      );

      const row = sqlite.prepare("SELECT * FROM tickets WHERE id = ?").get(info.lastInsertRowid) as any;
      return this.mapSqliteRow(row);
    }
    const [newTicket] = await db.insert(tickets).values(ticket).returning();
    return newTicket;
  }

  async getTicket(id: number): Promise<Ticket | undefined> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const row = sqlite.prepare("SELECT * FROM tickets WHERE id = ? AND deleted_at IS NULL").get(id) as any;
      if (!row) return undefined;
      return this.mapSqliteRow(row);
    }
    const [ticket] = await db.select().from(tickets).where(and(eq(tickets.id, id), sql`deleted_at IS NULL`));
    return ticket;
  }

  async getTickets(filters: any = {}): Promise<{ tickets: Ticket[]; total: number }> {
    const { limit = 20, offset = 0, status, priority, type, assignedTo, createdBy, search, sortBy } = filters;
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const where = ["deleted_at IS NULL"];
      const params: any[] = [];

      if (status) { where.push("status = ?"); params.push(status); }
      if (priority) { where.push("priority = ?"); params.push(priority); }
      if (type) { where.push("type = ?"); params.push(type); }
      if (assignedTo) { where.push("assigned_to = ?"); params.push(assignedTo); }
      if (createdBy) { where.push("created_by = ?"); params.push(createdBy); }
      if (search) {
        where.push("(title LIKE ? OR description LIKE ? OR ticket_number LIKE ?)");
        const s = `%${search}%`;
        params.push(s, s, s);
      }

      const whereClause = where.join(" AND ");
      const total = (sqlite.prepare(`SELECT COUNT(*) as total FROM tickets WHERE ${whereClause}`).get(...params) as any).total;

      let order = "created_at DESC";
      if (sortBy === 'oldest') order = "created_at ASC";
      if (sortBy === 'updated') order = "updated_at DESC";
      if (sortBy === 'priority') order = "CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END, created_at DESC";

      const rows = sqlite.prepare(`SELECT * FROM tickets WHERE ${whereClause} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params, limit, offset) as any[];
      return { tickets: rows.map((r: any) => this.mapSqliteRow(r)), total };
    }

    // Postgres implementation would go here... for now returning empty to keep focus on SQLite stability
    return { tickets: [], total: 0 };
  }

  async getStats(): Promise<any> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite.prepare(`SELECT status, priority, type, created_at, resolved_at FROM tickets WHERE deleted_at IS NULL`).all() as any[];
      return rows; // Logic handled in service
    }
    return [];
  }

  async updateTicket(id: number, update: any): Promise<boolean> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const updates: string[] = [];
      const params: any[] = [];
      for (const [key, value] of Object.entries(update)) {
        if (key === 'id' || key === 'createdAt') continue;
        const dbKey = key.replaceAll(/[A-Z]/g, l => `_${l.toLowerCase()}`);
        updates.push(`${dbKey} = ?`);
        params.push(value instanceof Date ? Math.floor(value.getTime() / 1000) : value);
      }
      if (updates.length === 0) return true;
      updates.push("updated_at = ?");
      params.push(Math.floor(Date.now() / 1000));
      const res = sqlite.prepare(`UPDATE tickets SET ${updates.join(", ")} WHERE id = ?`).run(...params, id);
      return res.changes > 0;
    }
    return false;
  }

  async deleteTicket(id: number): Promise<boolean> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const res = sqlite.prepare(`UPDATE tickets SET deleted_at = ? WHERE id = ?`).run(Math.floor(Date.now() / 1000), id);
      return res.changes > 0;
    }
    return false;
  }

  async restoreTicket(id: number): Promise<boolean> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const res = sqlite.prepare(`UPDATE tickets SET deleted_at = NULL WHERE id = ?`).run(id);
      return res.changes > 0;
    }
    return false;
  }

  // Comments
  async addComment(comment: any): Promise<number | null> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const now = Math.floor(Date.now() / 1000);
      const res = sqlite.prepare(`
        INSERT INTO ticket_comments (
          ticket_id, author_id, content, is_system, is_internal,
          change_type, change_from, change_to, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        comment.ticketId, comment.authorId, comment.content, 
        comment.isSystem ? 1 : 0, comment.isInternal ? 1 : 0,
        comment.changeType || null, comment.changeFrom || null, comment.changeTo || null,
        now, now
      );
      sqlite.prepare(`UPDATE tickets SET updated_at = ? WHERE id = ?`).run(now, comment.ticketId);
      return res.lastInsertRowid as number;
    }
    return null;
  }

  async getComments(ticketId: number, userRole: string): Promise<any[]> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const filter = userRole === "owner" ? "" : " AND is_internal = 0";
      const rows = sqlite.prepare(`
        SELECT c.*, u.username as author_username, u.role as author_role, u.verified as author_verified
        FROM ticket_comments c
        LEFT JOIN users u ON c.author_id = u.id
        WHERE c.ticket_id = ? AND c.deleted_at IS NULL ${filter}
        ORDER BY c.created_at ASC
      `).all(ticketId);
      return rows.map((c: any) => ({
        ...c,
        createdAt: new Date(c.created_at * 1000),
        updatedAt: new Date(c.updated_at * 1000),
        isSystem: Boolean(c.is_system),
        isInternal: Boolean(c.is_internal)
      }));
    }
    return [];
  }

  async updateComment(id: number, content: string): Promise<boolean> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const res = sqlite.prepare(`UPDATE ticket_comments SET content = ?, updated_at = ? WHERE id = ? AND is_system = 0`).run(content, Math.floor(Date.now() / 1000), id);
      return res.changes > 0;
    }
    return false;
  }

  async deleteComment(id: number): Promise<boolean> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const res = sqlite.prepare(`UPDATE ticket_comments SET deleted_at = ? WHERE id = ? AND is_system = 0`).run(Math.floor(Date.now() / 1000), id);
      return res.changes > 0;
    }
    return false;
  }

  // History
  async addHistory(history: any): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare(`
        INSERT INTO ticket_status_history (ticket_id, changed_by, from_status, to_status, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(history.ticketId, history.changedBy, history.fromStatus, history.toStatus, history.reason || null, Math.floor(Date.now() / 1000));
    }
  }

  async getHistory(ticketId: number): Promise<any[]> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite.prepare(`
        SELECT h.*, u.username as changed_by_username
        FROM ticket_status_history h
        LEFT JOIN users u ON h.changed_by = u.id
        WHERE h.ticket_id = ?
        ORDER BY h.created_at ASC
      `).all(ticketId);
      return rows.map((h: any) => ({ ...h, createdAt: new Date(h.created_at * 1000) }));
    }
    return [];
  }

  private mapSqliteRow(row: any) {
    if (!row) return row;
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
