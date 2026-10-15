import { Link, useLocation } from "wouter";
import { Home, Search, Plus, Bell, User, MessagesSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useNotificationCounts } from "@/hooks/use-notifications";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { CreatePostSelectorDialog } from "@/components/post/create-post-selector-dialog";

/**
 * MOBILE-NAV [UI-M-002]: iOS-style Tab Bar
 * Flat bottom navigation with a hairline top border and 44px+ touch targets.
 */
export function MobileBottomNav() {
  const { t } = useTranslation();
  const [location] = useLocation();
  const { user } = useAuth();
  const { data: counts } = useNotificationCounts();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  if (!user) return null;

  const tabs = [
    {
      to:    "/feed/media",
      icon:  Home,
      label: t("navigation.home", "Feed"),
      exact: false,
    },
    {
      to:    "/feed/discussions",
      icon:  MessagesSquare,
      label: t("navigation.discussions", "Talk"),
    },
    {
      to:      "/ai-generator",
      icon:    Plus,
      label:   t("navigation.create", "Create"),
      isPrimary: true,
    },
    {
      to:    "/notifications",
      icon:  Bell,
      label: t("navigation.notifications", "Inbox"),
      badge: counts?.unread ?? 0,
    },
    {
      to:    "/profile",
      icon:  user?.avatarUrl ? undefined : User,
      label: t("navigation.profile", "Me"),
      avatar: user?.avatarUrl,
    },
  ];

  return (
    <nav className={cn(
      // Only Mobile
      "md:hidden",
      // Positioning
      "fixed bottom-0 left-0 right-0 z-50",
      // Styling
      "bg-background/95",
      "border-t border-border",
      // Safe Area
      "pb-[env(safe-area-inset-bottom,0px)]",
      // Height (56px standard + safe area)
      "h-[calc(56px+env(safe-area-inset-bottom,0px))]",
    )}>
      <div className="flex items-center justify-around h-14">
        {tabs.map(tab => {
          const isActive = tab.to === "/profile" 
            ? location === "/profile"
            : location.startsWith(tab.to);

          return (
            <Link
              key={tab.to}
              href={tab.to}
              className={cn(
                // Touch Target 44×44px minimum
                "flex flex-col items-center justify-center",
                "min-w-[44px] min-h-[44px] flex-1",
                "gap-0.5 relative",
                // Transitions
                "transition-colors duration-150",
                // Active/Inactive
                isActive ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {/* Avatar instead of Icon for Profile */}
              {tab.avatar ? (
                <div className="ov-avatar h-6 w-6">
                  <img src={tab.avatar} alt="" className="w-full h-full object-cover" />
                </div>
              ) : tab.isPrimary ? (
                // Primary Action: open selector instead of navigation
                <button
                  key={tab.label}
                  onClick={(e) => {
                    e.preventDefault();
                    setIsCreateDialogOpen(true);
                  }}
                  className={cn(
                    "flex flex-col items-center justify-center flex-1 min-h-[44px] gap-0.5 relative"
                  )}
                >
                  <div className="ov-cut-2 h-7 w-11 bg-primary text-primary-foreground flex items-center justify-center">
                    <tab.icon className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-semibold leading-none text-foreground">{tab.label}</span>
                </button>
              ) : (
                // Standard Icon
                <div className="relative">
                  <tab.icon className="h-6 w-6" />
                  {/* Badge */}
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className={cn(
                      "absolute -top-1.5 -right-1.5",
                      "min-w-[16px] h-4 rounded-xs",
                      "bg-primary text-primary-foreground",
                      "font-data text-[10px] font-semibold tabular-nums",
                      "flex items-center justify-center px-1",
                      "animate-scale-in border border-background",
                    )}>
                      {tab.badge > 99 ? '99+' : tab.badge}
                    </span>
                  )}
                </div>
              )}

              {/* Label – small and clear */}
              {!tab.isPrimary && (
                <span className={cn(
                  "text-[10px] leading-none",
                  "transition-colors duration-150",
                  isActive ? "text-foreground font-semibold" : "text-muted-foreground font-medium",
                )}>
                  {tab.label}
                </span>
              )}

              {/* Active indicator: short bar under the label */}
              {isActive && !tab.isPrimary && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[14px] h-[2px] bg-primary animate-fade-in" />
              )}
            </Link>
          );
        })}
      </div>

      <CreatePostSelectorDialog 
        open={isCreateDialogOpen} 
        onOpenChange={setIsCreateDialogOpen} 
      />
    </nav>
  );
}
