import { storage } from "../storage";
import { sendToUser } from "./websocket";
import type { Notification} from "@shared/schema";
import { User } from "@shared/schema";

export type NotificationType = 
  | "new_follower"
  | "new_message"
  | "like_post"
  | "like_comment"
  | "comment_post"
  | "comment_reply"
  | "mention_post"
  | "mention_comment"
  | "community_invite"
  | "community_join_request"
  | "community_join_approved"
  | "community_kick"
  | "report_resolved"
  | "report_rejected"
  | "system_announcement";

export interface NotificationPayload {
  userId: number;
  actorId?: number;
  type: NotificationType;
  postId?: number;
  commentId?: number;
  communityId?: number;
  title?: string;
  message?: string;
  preview?: string;
  actionUrl?: string;
  groupKey?: string;
}

class NotificationService {
  /**
   * Primary method to create and push a notification
   */
  async notify(payload: NotificationPayload): Promise<Notification | null> {
    try {
      // 1. Check user preferences
      const preferences = await storage.getNotificationPreferences(payload.userId);
      if (!this.shouldNotify(payload.type, preferences)) {
        console.log(`[NotificationService] Notification suppressed by user preferences for user ${payload.userId}, type ${payload.type}`);
        return null;
      }

      // 2. Persist to database
      const notification = await storage.createNotification(payload);

      // 3. Push in real-time if user is online
      const pushPayload = await this.formatPushPayload(notification);
      sendToUser(payload.userId, JSON.stringify({
        type: "notification",
        data: pushPayload
      }));

      return notification;
    } catch (error) {
      console.error("[NotificationService] Error creating notification:", error);
      return null;
    }
  }

  /**
   * Specialized method for mention detection
   */
  async notifyMentions(content: string, actorId: number, options: { postId?: number, commentId?: number }) {
    const mentionRegex = /@([a-zA-Z0-9_]+)/g;
    const matches = content.matchAll(mentionRegex);
    const notifiedUserIds = new Set<number>();

    for (const match of matches) {
      const username = match[1];
      try {
        const user = await storage.getUserByUsername(username);
        if (user && user.id !== actorId && !notifiedUserIds.has(user.id)) {
          await this.notify({
            userId: user.id,
            actorId,
            type: options.commentId ? "mention_comment" : "mention_post",
            postId: options.postId,
            commentId: options.commentId,
            preview: content.slice(0, 100),
            actionUrl: options.commentId ? `/post/${options.postId}#comment-${options.commentId}` : `/post/${options.postId}`
          });
          notifiedUserIds.add(user.id);
        }
      } catch (err) {
        console.error(`[NotificationService] Failed to notify mention for @${username}:`, err);
      }
    }
  }

  /**
   * Private helper to check preferences
   */
  private shouldNotify(type: NotificationType, prefs: any): boolean {
    switch (type) {
      case "like_post": return prefs.likePost;
      case "like_comment": return prefs.likeComment;
      case "comment_post": return prefs.commentPost;
      case "comment_reply": return prefs.replyComment;
      case "mention_post": return prefs.mentionPost;
      case "mention_comment": return prefs.mentionComment;
      case "new_follower": return prefs.newFollower;
      case "community_invite": return prefs.communityInvite;
      case "community_join_approved": return prefs.communityInvite;
      case "community_join_request": return prefs.communityInvite;
      case "system_announcement": return prefs.systemAnnouncement;
      default: return true; // System defaults
    }
  }

  /**
   * Formats payload with actor data for frontend
   */
  private async formatPushPayload(notification: Notification) {
    let actor = null;
    if (notification.actorId) {
      const user = await storage.getUser(notification.actorId);
      if (user) {
        actor = {
          id: user.id,
          username: user.username,
          profilePictureUrl: user.profilePictureUrl
        };
      }
    }

    return {
      ...notification,
      actor
    };
  }
}

export const notificationService = new NotificationService();
