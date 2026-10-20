import type {
  Message} from "@shared/schema";
import {
  messages,
} from "@shared/schema";
import { db, getSqlite } from "../db";
import { eq, and, or, asc, desc, lt, sql } from "drizzle-orm";

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
        read: 0,
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

  /**
   * The newest `limit` messages of a conversation (optionally only those older than message `beforeId`),
   * returned oldest first, so long conversations still show their latest messages.
   */
  async getConversation(userId1: number, userId2: number, options: { limit?: number; beforeId?: number } = {}): Promise<Message[]> {
    const { limit = 100, beforeId } = options;
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite.prepare(`
        SELECT * FROM messages
        WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
          ${beforeId ? "AND id < ?" : ""}
        ORDER BY created_at DESC, id DESC LIMIT ?
      `).all(...[userId1, userId2, userId2, userId1, ...(beforeId ? [beforeId] : []), limit]);
      return rows.reverse().map((row: any) => ({
        id: row.id,
        senderId: row.sender_id,
        receiverId: row.receiver_id,
        content: row.content,
        read: Number(row.read),
        createdAt: new Date(Number(row.created_at) * 1000),
      }));
    }
    const conversation = or(
      and(eq(messages.senderId, userId1), eq(messages.receiverId, userId2)),
      and(eq(messages.senderId, userId2), eq(messages.receiverId, userId1)),
    );
    const rows = await db
      .select()
      .from(messages)
      .where(beforeId ? and(conversation, lt(messages.id, beforeId)) : conversation)
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(limit);
    return rows.reverse();
  }

  /** Marks every unread message from `senderId` to `receiverId` as read (the receiver opened the conversation). */
  async markConversationAsRead(receiverId: number, senderId: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare("UPDATE messages SET read = 1 WHERE receiver_id = ? AND sender_id = ? AND read = 0").run(receiverId, senderId);
      return;
    }
    await db
      .update(messages)
      .set({ read: 1 })
      .where(and(eq(messages.receiverId, receiverId), eq(messages.senderId, senderId), eq(messages.read, 0)));
  }

  async getUnreadMessageCount(userId: number): Promise<number> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const res = sqlite.prepare("SELECT COUNT(*) as count FROM messages WHERE receiver_id = ? AND read = 0").get(userId) as { count: number };
      return res.count;
    }
    const result = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(messages)
      .where(and(eq(messages.receiverId, userId), eq(messages.read, 0)));

    return result[0].count;
  }

  async markMessageAsRead(messageId: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare("UPDATE messages SET read = 1 WHERE id = ?").run(messageId);
      return;
    }
    await db.update(messages).set({ read: 1 }).where(eq(messages.id, messageId));
  }
}
