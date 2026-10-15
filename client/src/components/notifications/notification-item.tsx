import { formatDistanceToNow } from "date-fns";
import { de, enUS, es, fr, it, zhCN } from "date-fns/locale";
import { 
  Heart, 
  MessageSquare, 
  UserPlus, 
  AtSign, 
  ShieldCheck, 
  ShieldAlert, 
  Info,
  Circle,
  MoreHorizontal,
  Trash2,
  CheckCircle2,
  Users
} from "lucide-react";
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

const locales: Record<string, any> = { de, en: enUS, es, fr, it, zh: zhCN };

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
        return <MessageSquare className="h-4 w-4 text-primary" />;
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
      default:
        return <Info className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getContent = () => {
    const actorName = notification.actor?.username || "Someone";
    
    // Check for specific titles/messages first (System notifications)
    if (notification.title && notification.message) {
      return (
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-sm">{notification.title}</span>
          <span className="text-sm text-balance">{notification.message}</span>
        </div>
      );
    }

    // Dynamic localization based on type
    const translationKey = `notifications.types.${notification.type}`;
    const content = t(translationKey, { 
      actor: actorName, 
      name: notification.title || actorName,
      defaultValue: notification.message || t(`notifications.${notification.type}`, { name: notification.title })
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
        <UserAvatar user={{ username: notification.actor?.username || "U" }} size="sm" className="h-10 w-10 md:h-11 md:w-11" />
        <div className="absolute -bottom-1 -right-1 rounded-sm bg-background p-1 border border-border scale-90">
          {getIcon()}
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center justify-between gap-2">
           {getContent()}
           <span className="ov-data text-[11px] text-muted-foreground whitespace-nowrap">
              {formatDistanceToNow(new Date(notification.createdAt), {
                addSuffix: false,
                locale: locales[i18n.language] || locales.en
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
             Löschen
           </Button>
        </div>
      </div>
    </div>
  );
}
