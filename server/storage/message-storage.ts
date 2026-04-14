import type {
  Message} from "@shared/schema";
import {
  messages,
} from "@shared/schema";
import { db, getSqlite } from "../db";
import { eq, and, or, desc, asc, sql } from "drizzle-orm";

export class MessageStorage {
  async createMessage(message: {
    senderId: number;
    receiverId: number;
    content: string;
  }): Promise<Message> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const createdAt = Math.floor(Date.now() / 1000);
      const stmt = sqlite.prepare(
        "INSERT INTO messages (sender_id, receiver_id, content, read, created_at) VALUES (?, ?, ?, 0, ?)",
      );
      const res = stmt.run(message.senderId, message.receiverId, message.content, createdAt);
      
      return {
        id: res.lastInsertRowid as number,
        senderId: message.senderId,
        receiverId: message.receiverId,
        content: message.content,
        read: false,
        createdAt: new Date(createdAt * 1000),
      };
    }

    const [newMessage] = await db.insert(messages).values(message).returning();
    return newMessage;
  }

  async getMessages(userId1: number, userId2: number, options: { limit?: number; offset?: number } = {}): Promise<Message[]> {
    const { limit = 100, offset = 0 } = options;
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
       const rows = sqlite.prepare(`
        SELECT * FROM messages 
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        ORDER BY created_at ASC LIMIT ? OFFSET ?
      `).all(userId1, userId2, userId2, userId1, limit, offset);
      return rows.map((row: any) => ({
        ...row,
        createdAt: new Date(Number(row.created_at) * 1000),
        read: Boolean(row.read)
      }));
    }

    return db
      .select()
      .from(messages)
      .where(
        or(
          and(eq(messages.senderId, userId1), eq(messages.receiverId, userId2)),
          and(eq(messages.senderId, userId2), eq(messages.receiverId, userId1)),
        ),
      )
      .orderBy(asc(messages.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getUnreadMessageCount(userId: number): Promise<number> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const res = sqlite.prepare("SELECT COUNT(*) as count FROM messages WHERE receiver_id = ? AND read = 0").get(userId) as { count: number };
      return res.count;
    }
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(and(eq(messages.receiverId, userId), eq(messages.read, false)));

    return result[0].count;
  }

  async markMessageAsRead(messageId: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare("UPDATE messages SET read = 1 WHERE id = ?").run(messageId);
      return;
    }
    await db.update(messages).set({ read: true }).where(eq(messages.id, messageId));
  }
}
