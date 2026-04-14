import { useState, useEffect } from "react";
import { Bell, Check, Settings } from "lucide-react";
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useNotificationCounts, useNotifications, useNotificationMutations } from "@/hooks/use-notifications";
import { NotificationItem } from "./notification-item";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";

import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  
  const { data: counts } = useNotificationCounts();
  const { data: notifications, isLoading } = useNotifications({ limit: 10 });
  const { markAsSeen, markAllAsRead } = useNotificationMutations();
  const [_, setLocation] = useLocation();

  const [lastCount, setLastCount] = useState(0);
  const [shouldShake, setShouldShake] = useState(false);

  // Trigger bell-shake on new notifications
  useEffect(() => {
    const currentCount = counts?.unread ?? 0;
    if (currentCount > lastCount) {
      setShouldShake(true);
      const timer = setTimeout(() => setShouldShake(false), 600);
      return () => clearTimeout(timer);
    }
    setLastCount(currentCount);
  }, [counts?.unread]);

  // Mark as seen when opened to clear the badge
  useEffect(() => {
    if (open && counts && counts.unseen > 0) {
      markAsSeen.mutate();
    }
  }, [open, counts?.unseen]);

  const hasUnseen = (counts?.unseen ?? 0) > 0;
  const unreadCount = counts?.unread ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative h-10 w-10 rounded-full active:scale-90 transition-all" 
          aria-label="Notifications"
        >
          <Bell className={cn(
            "h-5 w-5 transition-all text-muted-foreground", 
            shouldShake && "animate-bell-shake text-primary",
            !shouldShake && hasUnseen && "animate-pulse"
          )} />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-0.5 -right-0.5 h-5 min-w-5 flex items-center justify-center p-1 text-[10px] font-black border-2 border-background animate-fade-scale"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      
      <PopoverContent className="w-96 p-0 overflow-hidden bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80" align="end" sideOffset={8}>
        <div className="flex items-center justify-between p-4 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-lg leading-none">{t("notifications.title")}</h3>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{unreadCount} unread</Badge>
            )}
          </div>
          
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => markAllAsRead.mutate()}
                    disabled={unreadCount === 0}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("notifications.mark_all_read")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setLocation("/notifications");
                      setOpen(false);
                    }}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("notifications.settings")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <ScrollArea className="h-[450px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Spinner size="lg" />
              <p className="text-sm text-muted-foreground animate-pulse">{t("common.loading")}</p>
            </div>
          ) : notifications?.length === 0 ? (
            <EmptyState 
              title={t("notifications.empty")} 
              description={t("notifications.empty_desc", "When you get notifications, they'll show up here.")}
              className="py-12" 
            />
          ) : (
            <div className="flex flex-col">
              {notifications?.map((notification) => (
                <NotificationItem 
                  key={notification.id} 
                  notification={notification} 
                  onClose={() => setOpen(false)} 
                />
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="p-2 border-t bg-muted/30 flex items-center justify-center">
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full text-xs font-semibold" 
            onClick={() => {
              setLocation("/notifications");
              setOpen(false);
            }}
          >
            {t("notifications.view_all", "View all notifications")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

