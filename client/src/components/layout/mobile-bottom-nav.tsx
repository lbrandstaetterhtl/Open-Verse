import { Link, useLocation } from "wouter";
import { Newspaper, MessageSquare, Users, Bell, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useNotificationCounts } from "@/hooks/use-notifications";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";

export function MobileBottomNav() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { data: counts } = useNotificationCounts();

  if (!user) return null;

  const unreadCount = counts?.unread ?? 0;

  const tabs = [
    {
      href: "/feed/media",
      icon: Newspaper,
      label: t("navbar.media_feed", "Media"),
    },
    {
      href: "/feed/discussions",
      icon: MessageSquare,
      label: t("navbar.discussions_feed", "Discuss"),
    },
    {
      href: "/feed/communities",
      icon: Users,
      label: t("navbar.communities", "Community"),
    },
    {
      href: "/notifications",
      icon: Bell,
      label: t("notifications.title", "Alerts"),
      badge: unreadCount,
    },
    {
      href: "/profile",
      icon: User,
      label: t("navbar.profile", "Profile"),
    },
  ];

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-[100] md:hidden",
        "border-t border-border/40",
        "safe-area-pb"
      )}
      style={{
        background:
          "linear-gradient(to top, hsl(var(--background) / 0.98), hsl(var(--background) / 0.92))",
        backdropFilter: "blur(16px) saturate(180%)",
        WebkitBackdropFilter: "blur(16px) saturate(180%)",
      }}
    >
      {/* Premium top border gradient */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      <div className="flex items-center justify-around px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {tabs.map((tab) => {
          const isActive =
            location === tab.href ||
            (tab.href !== "/profile" && location.startsWith(tab.href));
          const Icon = tab.icon;

          return (
            <Link key={tab.href} href={tab.href} className="flex-1">
              <div className="flex flex-col items-center gap-1 py-1 relative group">
                {/* Active background pill */}
                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      layoutId="mobile-nav-pill"
                      className="absolute inset-x-2 top-0 bottom-1 rounded-2xl bg-primary/10"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                </AnimatePresence>

                {/* Icon with badge */}
                <div className="relative">
                  <motion.div
                    whileTap={{ scale: 0.85 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  >
                    <Icon
                      className={cn(
                        "h-5 w-5 transition-all duration-300 relative z-10",
                        isActive
                          ? "text-primary scale-110"
                          : "text-muted-foreground group-active:text-foreground"
                      )}
                      strokeWidth={isActive ? 2.5 : 1.8}
                    />
                  </motion.div>

                  {/* Notification badge */}
                  {tab.badge && tab.badge > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-1.5 -right-1.5 h-4 min-w-4 flex items-center justify-center rounded-full bg-destructive text-[9px] font-black text-destructive-foreground px-0.5 border-2 border-background z-20"
                    >
                      {tab.badge > 99 ? "99+" : tab.badge}
                    </motion.span>
                  )}
                </div>

                {/* Label */}
                <span
                  className={cn(
                    "text-[10px] font-semibold transition-all duration-300 relative z-10 leading-none",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {tab.label}
                </span>

                {/* Active dot indicator */}
                {isActive && (
                  <motion.div
                    layoutId="mobile-nav-dot"
                    className="absolute -bottom-0.5 h-1 w-1 rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
