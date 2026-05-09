import { Link, useLocation } from "wouter";
import { Home, Search, PlusSquare, Bell, User, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useNotificationCounts } from "@/hooks/use-notifications";
import { useTranslation } from "react-i18next";

/**
 * MOBILE-NAV [UI-M-002]: iOS-style Tab Bar
 * Implements a premium, blurred bottom navigation with 44px+ touch targets.
 */
export function MobileBottomNav() {
  const { t } = useTranslation();
  const [location] = useLocation();
  const { user } = useAuth();
  const { data: counts } = useNotificationCounts();

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
      icon:  MessageCircle,
      label: t("navigation.discussions", "Talk"),
    },
    {
      to:      "/ai-generator",
      icon:    PlusSquare,
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
      "bg-background/80 backdrop-blur-xl saturate-150",
      "border-t border-border/50",
      // Safe Area
      "pb-[env(safe-area-inset-bottom,0px)]",
      // Height (56px standard + safe area)
      "h-[calc(56px+env(safe-area-inset-bottom,0px))]",
    )}>
      {/* Visual Accent Top Line */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

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
                "transition-all duration-150",
                // Active/Inactive
                isActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              {/* Avatar instead of Icon for Profile */}
              {tab.avatar ? (
                <div className={cn(
                  "h-6 w-6 rounded-full overflow-hidden",
                  "ring-2 transition-all duration-150",
                  isActive ? "ring-primary" : "ring-transparent",
                )}>
                  <img src={tab.avatar} alt="" className="w-full h-full object-cover" />
                </div>
              ) : tab.isPrimary ? (
                // Primary Action: larger icon or distinct styling
                <div className={cn(
                  "h-8 w-8 rounded-xl",
                  "bg-primary text-primary-foreground",
                  "flex items-center justify-center",
                  "shadow-sm",
                  "transition-transform duration-150 active:scale-90",
                  "animate-scale-in"
                )}>
                  <tab.icon className="h-5 w-5" />
                </div>
              ) : (
                // Standard Icon
                <div className="relative">
                  <tab.icon className={cn(
                    "h-6 w-6 transition-all duration-150",
                    isActive && "scale-110",
                  )} />
                  {/* Badge */}
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className={cn(
                      "absolute -top-1.5 -right-1.5",
                      "min-w-[16px] h-4 rounded-full",
                      "bg-destructive text-destructive-foreground",
                      "text-[10px] font-bold",
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
                  "text-[10px] font-medium leading-none",
                  "transition-all duration-150",
                  isActive ? "text-primary font-bold" : "text-muted-foreground",
                )}>
                  {tab.label}
                </span>
              )}

              {/* Active Dot indicator */}
              {isActive && !tab.isPrimary && (
                <div className="absolute -bottom-1 w-1 h-1 rounded-full bg-primary animate-fade-in" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
