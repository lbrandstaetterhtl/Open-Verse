import { formatDistanceToNow } from "date-fns";
import { dateLocaleFor } from "@/lib/date-locale";
import { Heart, MessageCircle, UserPlus, AtSign, ShieldCheck, ShieldAlert, Info, Circle, MoreHorizontal, Trash2, CheckCircle2, Users } from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "react-i18next";
import type { NotificationWithActor } from "@/hooks/use-notifications";
import { useLocation } from "wouter";
import { useNotificationMutations } from "@/hooks/use-notifications";
import { cn } from "@/lib/utils";


/** Notifications about the user's own things that never name another person (server/services/notification-service.ts). */
const SYSTEM_TYPES = new Set(["report_resolved", "report_rejected", "community_join_approved", "community_kick", "system_announcement", "system_warning"]);
/** Notifications about something another user did; without an actor (deleted account) they read "Someone …". */
const ACTOR_TYPES = new Set(["new_follower", "new_message", "like_post", "like_comment", "comment_post", "comment_reply", "mention_post",
  "mention_comment", "community_join_request", "community_invite"]);
/** Title the ticket service stores for "staff replied to your ticket" (server/services/ticket-service.ts). */
const TICKET_REPLY_TITLE = "New Ticket Reply";

interface NotificationItemProps {
  notification: NotificationWithActor;
  onClose?: () => void;
}

export function NotificationItem({ notification, onClose }: NotificationItemProps) {
  const { t, i18n } = useTranslation();
  const [, setLocation] = useLocation();
  const { markAsRead, deleteNotification } = useNotificationMutations();

  const handleAction = () => {
    if (!notification.read) {
      markAsRead.mutate(notification.id);
    }
    if (notification.actionUrl) {
      setLocation(notification.actionUrl);
      if (onClose) onClose();
    }
  };

  const getIcon = () => {
    switch (notification.type) {
      case "like_post":
      case "like_comment":
        return <Heart className="h-4 w-4 text-star fill-star" />;
      case "comment_post":
      case "comment_reply":
        return <MessageCircle className="h-4 w-4 text-primary" />;
      case "new_follower":
        return <UserPlus className="h-4 w-4 text-primary" />;
      case "mention_post":
      case "mention_comment":
        return <AtSign className="h-4 w-4 text-primary" />;
      case "community_join_approved":
        return <CheckCircle2 className="h-4 w-4 text-primary" />;
      case "community_join_request":
        return <Users className="h-4 w-4 text-star" />;
      case "community_kick":
        return <ShieldAlert className="h-4 w-4 text-destructive" />;
      case "report_resolved":
        return <ShieldCheck className="h-4 w-4 text-primary" />;
      case "report_rejected":
        return <ShieldAlert className="h-4 w-4 text-muted-foreground" />;
      case "system_warning":
        return <ShieldAlert className="h-4 w-4 text-destructive" />;
      default:
        return <Info className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const actorUsername = notification.actor?.username;
  // System notifications (report outcomes, ticket replies, account warnings) name nobody: no "Someone" prefix
  const isSystem = SYSTEM_TYPES.has(notification.type) || (!actorUsername && !ACTOR_TYPES.has(notification.type));

  const getContent = () => {
    const actorName = actorUsername || t("notifications.someone", "Someone");
    const block = (title: string, message?: string | null) => (
      <div className="flex flex-col gap-0.5">
        <span className="font-semibold text-sm">{title}</span>
        {message && <span className="text-sm text-balance">{message}</span>}
      </div>
    );

    // Texts the server stores in English for these system notifications are shown in the UI language
    if (notification.type === "system_warning") {
      // The message is the reason the staff wrote into the moderation rule
      return block(t("notifications.system.account_warning", "Account warning"), notification.message);
    }
    if (notification.type === "system_announcement" && notification.title === TICKET_REPLY_TITLE) {
      const ticket = (notification.message ?? "").split(": ").slice(1).join(": ");
      return block(
        t("notifications.system.ticket_reply_title", "New reply on your ticket"),
        ticket ? t("notifications.system.ticket_reply_message", { ticket, defaultValue: "There is a new reply on your ticket {{ticket}}." }) : null,
      );
    }
    if (notification.title && notification.message) return block(notification.title, notification.message);

    if (isSystem) {
      let text: string;
      if ((notification.type === "community_join_approved" || notification.type === "community_kick") && !notification.title) {
        text = notification.type === "community_join_approved"
          ? t("notifications.system.join_approved_generic", "Your request to join a community was approved")
          : t("notifications.system.kicked_generic", "You were removed from a community");
      } else {
        text = t(`notifications.types.${notification.type}`, {
          name: notification.title ?? "",
          defaultValue: notification.message || notification.title || t("notifications.system.generic", "System notification"),
        });
      }
      return <p className="text-sm leading-snug text-foreground">{text}</p>;
    }

    // Dynamic localization based on type
    const translationKey = `notifications.types.${notification.type}`;
    const content = t(translationKey, { 
      actor: actorName, 
      name: notification.title || actorName,
      defaultValue: notification.message || t("notifications.types.action", { actor: actorName })
    });

    return (
      <div className="flex flex-col gap-0.5">
        <p className="text-sm leading-snug">
          <span className="font-semibold text-foreground">{actorName}</span>{" "}
          <span className="text-muted-foreground">{content.replace(actorName, "").trim()}</span>
        </p>
        {notification.preview && (
          <p className="text-xs text-muted-foreground line-clamp-1 italic">
             "{notification.preview}"
          </p>
        )}
      </div>
    );
  };

  return (
    <div 
      className={cn(
        "group relative flex items-start gap-3 px-4 py-3 transition-colors cursor-pointer",
        "hover:bg-accent/50 active:bg-accent/70",
        !notification.read && "bg-primary/5"
      )}
      onClick={handleAction}
    >
      {/* Unread indicator dot */}
      {!notification.read && (
        <span aria-hidden="true" className="absolute left-1.5 top-[30px] h-1.5 w-1.5 rounded-full bg-primary" />
      )}

      <div className="relative flex-shrink-0">
        {isSystem ? (
          <div className="ov-panel flex h-10 w-10 items-center justify-center md:h-11 md:w-11" aria-hidden="true">
            {getIcon()}
          </div>
        ) : (
          <>
            <UserAvatar user={{ username: actorUsername || "U" }} size="sm" className="h-10 w-10 md:h-11 md:w-11" />
            <div className="absolute -bottom-1 -right-1 rounded-sm bg-background p-1 border border-border scale-90">
              {getIcon()}
            </div>
          </>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center justify-between gap-2">
           {getContent()}
           <span className="ov-data text-[11px] text-muted-foreground whitespace-nowrap">
              {formatDistanceToNow(new Date(notification.createdAt), {
                addSuffix: false,
                locale: dateLocaleFor(i18n.language)
              })}
           </span>
        </div>
        
        <div className="flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
           <Button 
             variant="ghost" 
             size="sm" 
             className="h-7 px-2 text-xs"
             onClick={(e) => {
               e.stopPropagation();
               deleteNotification.mutate(notification.id);
             }}
           >
             {t("common.delete")}
           </Button>
        </div>
      </div>
    </div>
  );
}
