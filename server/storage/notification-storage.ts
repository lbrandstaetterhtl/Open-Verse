import type {
  Notification,
  NotificationPreferences,
  User} from "@shared/schema";
import {
  notifications,
  notificationPreferences,
  users
} from "@shared/schema";
import { db, getSqlite } from "../db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";

export class NotificationStorage {
  async createNotification(notification: {
    userId: number;
    actorId?: number;
    type: string;
    postId?: number;
    commentId?: number;
    communityId?: number;
    title?: string;
    message?: string;
    preview?: string;
    actionUrl?: string;
    groupKey?: string;
  }): Promise<Notification> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const createdAt = Math.floor(Date.now() / 1000);
      const res = sqlite
        .prepare(`
          INSERT INTO notifications (
            user_id, actor_id, type, post_id, comment_id, community_id, 
            title, message, preview, action_url, group_key, read, seen, archived, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?)
        `)
        .run(
          notification.userId,
          notification.actorId || null,
          notification.type,
          notification.postId || null,
          notification.commentId || null,
          notification.communityId || null,
          notification.title || null,
          notification.message || null,
          notification.preview || null,
          notification.actionUrl || null,
          notification.groupKey || null,
          createdAt
        );
      return {
        id: res.lastInsertRowid as number,
        ...notification,
        actorId: notification.actorId || null,
        postId: notification.postId || null,
        commentId: notification.commentId || null,
        communityId: notification.communityId || null,
        title: notification.title || null,
        message: notification.message || null,
        preview: notification.preview || null,
        actionUrl: notification.actionUrl || null,
        groupKey: notification.groupKey || null,
        read: false,
        seen: false,
        archived: false,
        createdAt: new Date(createdAt * 1000),
      };
    }
    const [newNotification] = await db
      .insert(notifications)
      .values({
        ...notification,
        read: 0,
        seen: 0,
        archived: 0,
      })
      .returning();
    return newNotification;
  }

  async getNotifications(
    userId: number,
    options: { limit?: number; offset?: number; unreadOnly?: boolean; type?: string[] } = {}
  ): Promise<(Notification & { actor?: User | null })[]> {
    const { limit = 50, offset = 0, unreadOnly = false, type } = options;
    
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      let query = `
        SELECT n.*, u.username as actor_username, u.profile_picture_url as actor_avatar
        FROM notifications n
        LEFT JOIN users u ON n.actor_id = u.id
        WHERE n.user_id = ? AND n.archived = 0
      `;
      const params: any[] = [userId];

      if (unreadOnly) {
        query += " AND n.read = 0";
      }
      if (type && type.length > 0) {
        query += ` AND n.type IN (${type.map(() => "?").join(",")})`;
        params.push(...type);
      }

      query += " ORDER BY n.created_at DESC LIMIT ? OFFSET ?";
      params.push(limit, offset);

      const rows = sqlite.prepare(query).all(...params);
      return rows.map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        actorId: row.actor_id,
        type: row.type,
        postId: row.post_id,
        commentId: row.comment_id,
        communityId: row.community_id,
        title: row.title,
        message: row.message,
        preview: row.preview,
        actionUrl: row.action_url,
        read: Boolean(row.read),
        seen: Boolean(row.seen),
        archived: Boolean(row.archived),
        groupKey: row.group_key,
        createdAt: isNaN(Number(row.created_at)) ? new Date(row.created_at) : new Date(Number(row.created_at) * 1000),
        actor: row.actor_id ? {
          id: row.actor_id,
          username: row.actor_username,
          profilePictureUrl: row.actor_avatar
        } as any : null
      }));
    }

    let whereClause = and(eq(notifications.userId, userId), eq(notifications.archived, 0));
    if (unreadOnly) {
      whereClause = and(whereClause, eq(notifications.read, 0));
    }
    if (type && type.length > 0) {
      whereClause = and(whereClause, inArray(notifications.type, type));
    }

    const result = await db
      .select({
        notification: notifications,
        actor: users
      })
      .from(notifications)
      .leftJoin(users, eq(notifications.actorId, users.id))
      .where(whereClause)
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);

    return result.map(({ notification, actor }: { notification: Notification; actor: User | null }) => ({
      ...notification,
      actor: actor || null
    }));
  }

  async getNotificationCounts(userId: number): Promise<{ unread: number; unseen: number }> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const unread = sqlite.prepare("SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0 AND archived = 0").get(userId) as { count: number };
      const unseen = sqlite.prepare("SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND seen = 0 AND archived = 0").get(userId) as { count: number };
      return { unread: unread.count, unseen: unseen.count };
    }

    const unreadResult = await db.select({ count: sql<number>`count(*)` }).from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.read, 0), eq(notifications.archived, 0)));
    const unseenResult = await db.select({ count: sql<number>`count(*)` }).from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.seen, 0), eq(notifications.archived, 0)));

    return {
      unread: Number(unreadResult[0].count),
      unseen: Number(unseenResult[0].count)
    };
  }

  async markNotificationAsRead(notificationId: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare("UPDATE notifications SET read = 1 WHERE id = ?").run(notificationId);
      return;
    }
    await db.update(notifications).set({ read: 1 }).where(eq(notifications.id, notificationId));
  }

  async markAllNotificationsAsRead(userId: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare("UPDATE notifications SET read = 1 WHERE user_id = ? AND archived = 0").run(userId);
      return;
    }
    await db.update(notifications).set({ read: 1 }).where(and(eq(notifications.userId, userId), eq(notifications.archived, 0)));
  }

  async markNotificationsAsSeen(userId: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare("UPDATE notifications SET seen = 1 WHERE user_id = ? AND archived = 0").run(userId);
      return;
    }
    await db.update(notifications).set({ seen: 1 }).where(and(eq(notifications.userId, userId), eq(notifications.archived, 0)));
  }

  async deleteNotification(notificationId: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare("UPDATE notifications SET archived = 1 WHERE id = ?").run(notificationId);
      return;
    }
    await db.update(notifications).set({ archived: 1 }).where(eq(notifications.id, notificationId));
  }

  async deleteAllNotifications(userId: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare("UPDATE notifications SET archived = 1 WHERE user_id = ?").run(userId);
      return;
    }
    await db.update(notifications).set({ archived: 1 }).where(eq(notifications.userId, userId));
  }

  async getNotificationPreferences(userId: number): Promise<NotificationPreferences> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      let prefs = sqlite.prepare("SELECT * FROM notification_preferences WHERE user_id = ?").get(userId) as any;
      if (!prefs) {
        sqlite.prepare("INSERT INTO notification_preferences (user_id) VALUES (?)").run(userId);
        prefs = sqlite.prepare("SELECT * FROM notification_preferences WHERE user_id = ?").get(userId);
      }
      return {
        userId: prefs.user_id,
        likePost: Boolean(prefs.like_post),
        likeComment: Boolean(prefs.like_comment),
        commentPost: Boolean(prefs.comment_post),
        replyComment: Boolean(prefs.reply_comment),
        mentionPost: Boolean(prefs.mention_post),
        mentionComment: Boolean(prefs.mention_comment),
        newFollower: Boolean(prefs.new_follower),
        communityInvite: Boolean(prefs.community_invite),
        communityPost: Boolean(prefs.community_post),
        postMilestone: Boolean(prefs.post_milestone),
        systemAnnouncement: Boolean(prefs.system_announcement),
        browserNotifications: Boolean(prefs.browser_notifications),
        updatedAt: isNaN(Number(prefs.updated_at)) ? new Date(prefs.updated_at) : new Date(Number(prefs.updated_at) * 1000)
      };
    }

    const [prefs] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId));
    if (!prefs) {
      const [newPrefs] = await db.insert(notificationPreferences).values({ userId }).returning();
      return newPrefs;
    }
    return prefs;
  }

  async updateNotificationPreferences(userId: number, update: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const sets: string[] = [];
      const params: any[] = [];
      
      for (const [key, value] of Object.entries(update)) {
        if (key === 'userId' || key === 'updatedAt') continue;
        const dbKey = key.replaceAll(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        sets.push(`${dbKey} = ?`);
        params.push(value ? 1 : 0);
      }
      
      if (sets.length > 0) {
        params.push(userId);
        sqlite.prepare(`UPDATE notification_preferences SET ${sets.join(", ")}, updated_at = strftime('%s', 'now') WHERE user_id = ?`).run(...params);
      }
      return this.getNotificationPreferences(userId);
    }

    const [updated] = await db
      .update(notificationPreferences)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(notificationPreferences.userId, userId))
      .returning();
    return updated;
  }
}
