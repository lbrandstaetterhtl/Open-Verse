import type {
  Report} from "@shared/schema";
import {
  reports,
} from "@shared/schema";
import { db, getSqlite } from "../db";
import { eq, and, desc, sql, or } from "drizzle-orm";

export class SecurityStorage {
  // Reports
  async createReport(report: Omit<Report, "id" | "createdAt" | "status">): Promise<Report> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const { reporterId, postId, commentId, discussionId, reason, ipAddress } = report;
      const createdAt = Math.floor(Date.now() / 1000);
      const res = sqlite
        .prepare(
          "INSERT INTO reports (reporter_id, post_id, comment_id, discussion_id, ip_address, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          reporterId,
          postId || null,
          commentId || null,
          discussionId || null,
          ipAddress || null,
          reason,
          "pending",
          createdAt,
        );
      return {
        id: res.lastInsertRowid as number,
        reporterId,
        postId: postId || null,
        commentId: commentId || null,
        discussionId: discussionId || null,
        ipAddress: report.ipAddress || null,
        reason,
        status: "pending",
        createdAt: new Date(createdAt * 1000),
      } as any;
    }

    const [newReport] = await db
      .insert(reports)
      .values({ ...report, status: "pending" })
      .returning();
    return newReport;
  }

  async getReports(options: { status?: string; limit?: number; offset?: number } = {}): Promise<Report[]> {
    const { status, limit = 50, offset = 0 } = options;
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      let query = "SELECT * FROM reports";
      const params: any[] = [];
      if (status) {
        query += " WHERE status = ?";
        params.push(status);
      }
      query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
      params.push(limit, offset);
      const rows = sqlite.prepare(query).all(...params);
      return rows.map((row: any) => ({
        ...row,
        createdAt: isNaN(Number(row.created_at)) ? new Date(row.created_at) : new Date(row.created_at * 1000),
        reporterId: row.reporter_id,
        postId: row.post_id,
        commentId: row.comment_id,
        discussionId: row.discussion_id,
        ipAddress: row.ip_address,
      } as any));
    }

    const whereConditions = status ? [eq(reports.status, status)] : [];
    return await db.select()
      .from(reports)
      .where(and(...whereConditions))
      .orderBy(desc(reports.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async updateReportStatus(id: number, status: string, resolvedBy?: number, resolutionTimeSeconds?: number): Promise<Report> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const sets = ["status = ?"];
      const params: any[] = [status];
      
      if (status === "resolved" || status === "rejected") {
        sets.push("resolved_at = datetime('now')");
        if (resolvedBy) {
          sets.push("resolved_by = ?");
          params.push(resolvedBy);
        }
        if (resolutionTimeSeconds) {
          sets.push("resolution_time_seconds = ?");
          params.push(resolutionTimeSeconds);
        }
      }
      
      params.push(id);
      sqlite.prepare(`UPDATE reports SET ${sets.join(", ")} WHERE id = ?`).run(...params);
      
      const report = sqlite.prepare("SELECT * FROM reports WHERE id = ?").get(id) as any;

      return {
        ...report,
        createdAt: isNaN(Number(report.created_at)) ? new Date(report.created_at) : new Date(report.created_at * 1000),
        resolvedAt: report.resolved_at ? new Date(report.resolved_at) : null,
      } as any;
    }
    
    const updateData: any = { status };
    if (status === "resolved" || status === "rejected") {
      updateData.resolvedAt = new Date();
      if (resolvedBy) updateData.resolvedBy = resolvedBy;
      if (resolutionTimeSeconds) updateData.resolutionTimeSeconds = resolutionTimeSeconds;
    }

    const [report] = await db.update(reports).set(updateData).where(eq(reports.id, id)).returning();
    return report;
  }

  async deleteReportsForContent(postId?: number, commentId?: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      if (postId) sqlite.prepare("DELETE FROM reports WHERE post_id = ?").run(postId);
      if (commentId) sqlite.prepare("DELETE FROM reports WHERE comment_id = ?").run(commentId);
      return;
    }
    const conditions = [];
    if (postId) conditions.push(eq(reports.postId, postId));
    if (commentId) conditions.push(eq(reports.commentId, commentId));
    if (conditions.length > 0) {
      await db.delete(reports).where(or(...conditions));
    }
  }

  // Stats
  async getGlobalStat(key: string): Promise<number> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const row = sqlite.prepare("SELECT value FROM global_stats WHERE key = ?").get(key) as { value: number };
      return row ? row.value : 0;
    }
    return 0; // Postres path needs a stats table too if required
  }

  async incrementGlobalStat(key: string): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare("UPDATE global_stats SET value = value + 1 WHERE key = ?").run(key);
    }
  }
}
