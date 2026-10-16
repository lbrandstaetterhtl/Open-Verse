import { Link, useLocation } from "wouter";
import { Home, Plus, Send, User, MessagesSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { CreatePostSelectorDialog } from "@/components/post/create-post-selector-dialog";

/**
 * Bottom tab bar on phones: the four main places plus "Create" in the middle.
 * Notifications live behind the bell in the phone header, everything else in the menu.
 */
export function MobileBottomNav() {
  const { t } = useTranslation();
  const [location] = useLocation();
  const { user } = useAuth();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  if (!user) return null;

  const tabs = [
    { to: "/feed/media", icon: Home, label: t("nav.bottom_feed", "Feed"), alsoActive: ["/"] },
    { to: "/feed/discussions", icon: MessagesSquare, label: t("nav.bottom_discussions", "Discussions") },
    { to: "/chat", icon: Send, label: t("navbar.messages", "Messages") },
    { to: "/profile", icon: User, label: t("navbar.profile", "Profile"), avatar: user.avatarUrl },
  ];
  const isActive = (tab: (typeof tabs)[number]) =>
    [tab.to, ...(tab.alsoActive ?? [])].some((p) => (p === "/" ? location === "/" : location === p || location.startsWith(p + "/")));

  const tabLink = (tab: (typeof tabs)[number]) => {
    const active = isActive(tab);
    return (
      <Link
        key={tab.to}
        href={tab.to}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 transition-colors duration-150",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {tab.avatar ? (
          <div className="ov-avatar h-6 w-6">
            <img src={tab.avatar} alt="" className="h-full w-full object-cover" />
          </div>
        ) : (
          <tab.icon className="h-6 w-6" />
        )}
        <span className={cn("text-[10px] leading-none", active ? "font-semibold" : "font-medium")}>{tab.label}</span>
        {active && <div className="absolute bottom-0 left-1/2 h-[2px] w-[14px] -translate-x-1/2 bg-primary" />}
      </Link>
    );
  };

  return (
    <nav
      aria-label={t("navbar.navigation", "Navigation")}
      className="fixed bottom-0 left-0 right-0 z-50 h-[calc(56px+env(safe-area-inset-bottom,0px))] border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom,0px)] md:hidden"
    >
      <div className="flex h-14 items-center justify-around">
        {tabs.slice(0, 2).map(tabLink)}
        <button
          onClick={() => setIsCreateDialogOpen(true)}
          className="relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5"
        >
          <div className="ov-cut-2 flex h-7 w-11 items-center justify-center bg-primary text-primary-foreground">
            <Plus className="h-5 w-5" />
          </div>
          <span className="text-[10px] font-semibold leading-none text-foreground">{t("navigation.create", "Create")}</span>
        </button>
        {tabs.slice(2).map(tabLink)}
      </div>

      <CreatePostSelectorDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} />
    </nav>
  );
}
