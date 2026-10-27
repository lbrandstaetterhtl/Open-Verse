import React, { Suspense, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { useNotificationCounts } from "@/hooks/use-notifications";
import {
  Home, Send, MessagesSquare, Users, Bell, User, Shield, ArrowLeft, ChevronLeft, ChevronRight, X, Bot, Palette,
  LogOut, MoreHorizontal, Sparkles, LifeBuoy, Gavel, Plus,
} from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QuickThemeSwitcher } from "@/components/theme/quick-theme-switcher";
import { LanguageToggle } from "@/components/theme/language-toggle";
import { CreatePostSelectorDialog } from "@/components/post/create-post-selector-dialog";
import { NavItemRow, NavSections, type NavItem, type NavSection } from "./nav-row";
import { StaffNav } from "@/lib/staff";

interface AppSidebarProps {
  isAdmin: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onClose: () => void;
}

export function AppSidebar({ isAdmin, collapsed, onToggleCollapse, onClose }: AppSidebarProps) {
  const { t } = useTranslation();
  const { user, logoutMutation, hasPermission } = useAuth();
  const { data: counts } = useNotificationCounts();
  const [createOpen, setCreateOpen] = useState(false);
  const isStaff = ["admin", "owner"].includes(user?.role ?? "");

  // Moderators of a community see "Moderation" too, not only admins.
  const { data: moderated } = useQuery<unknown[]>({
    queryKey: ["/api/user/moderated-communities"],
    enabled: !!user && !isAdmin,
    staleTime: 5 * 60 * 1000,
  });
  const canModerate = isStaff || (moderated?.length ?? 0) > 0;

  const appSections: NavSection[] = [
    {
      title: t("nav.section_discover", "Discover"),
      items: [
        { href: "/feed/media", icon: Home, label: t("navbar.media_feed", "Media feed"), alsoActive: ["/"] },
        { href: "/feed/discussions", icon: MessagesSquare, label: t("navbar.discussions_feed", "Discussions feed") },
        { href: "/feed/communities", icon: Users, label: t("navbar.communities", "Communities"), alsoActive: ["/c", "/create-community"] },
      ],
    },
    {
      title: t("nav.section_you", "For you"),
      items: [
        { href: "/notifications", icon: Bell, label: t("navigation.notifications", "Notifications"), badge: counts?.unread ?? 0 },
        { href: "/chat", icon: Send, label: t("navbar.messages", "Messages") },
        { href: "/profile", icon: User, label: t("navbar.profile", "Profile") },
      ],
    },
    {
      title: t("nav.section_tools", "Tools"),
      items: [
        { href: "/ai-generator", icon: Bot, label: t("navbar.ai_generator", "AI generator") },
        { href: "/theme-builder", icon: Palette, label: t("nav.theme_builder", "Theme builder") },
        { href: "/tickets", icon: LifeBuoy, label: t("nav.help_tickets", "Help & tickets") },
      ],
    },
  ];
  if (canModerate) {
    appSections.push({
      title: t("navbar.section_admin", "Administration"),
      items: [
        { href: "/mod-panel", icon: Gavel, label: t("nav.moderation", "Moderation") },
        ...(isStaff ? [{ href: "/admin", icon: Shield, label: t("nav.admin_area", "Admin area") }] : []),
      ],
    });
  }

  const allowed = (item: NavItem) => user?.role === "owner" || !item.permission || hasPermission(item.permission);
  const sections = appSections
    .map((s) => ({ ...s, items: s.items.filter(allowed) }))
    .filter((s) => s.items.length > 0);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── HEADER ── */}
      <div className={cn("flex h-14 flex-shrink-0 items-center gap-2 border-b border-border px-3", collapsed && "lg:justify-center")}>
        <Link href="/" onClick={onClose} className={cn("flex min-w-0 flex-1 items-center gap-2.5", collapsed && "lg:hidden")}>
          <div className="ov-panel flex h-8 w-8 flex-shrink-0 items-center justify-center">
            <Sparkles className="h-4 w-4 fill-current text-star" aria-hidden="true" />
          </div>
          {!collapsed && <span className="truncate font-display text-[16px] font-semibold sidebar-label">Osiris</span>}
        </Link>

        <button
          onClick={onToggleCollapse}
          aria-label={collapsed ? t("nav.expand", "Expand sidebar") : t("nav.collapse", "Collapse sidebar")}
          aria-expanded={!collapsed}
          className="hidden h-7 w-7 flex-shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground lg:flex sidebar-toggle"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>

        <button
          onClick={onClose}
          aria-label={t("nav.close_menu", "Close menu")}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground md:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── NAVIGATION ── */}
      <nav aria-label={isAdmin ? t("navbar.section_admin", "Administration") : t("navbar.navigation", "Navigation")} className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-2 py-3 scrollbar-none">
        {isAdmin ? (
          <NavItemRow item={{ href: "/feed/media", icon: ArrowLeft, label: t("nav.back_to_app", "Back to app"), exact: true }} collapsed={collapsed} onNavigate={onClose} />
        ) : (
          <button
            onClick={() => setCreateOpen(true)}
            title={collapsed ? t("nav.create_post", "Create post") : undefined}
            className={cn(
              "ov-cut mb-1 flex h-10 w-full items-center bg-primary font-semibold text-primary-foreground transition-opacity hover:opacity-90 sidebar-row",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              collapsed ? "justify-center px-2" : "gap-3 px-3",
            )}
          >
            <Plus className="h-[18px] w-[18px] flex-shrink-0" />
            {!collapsed && <span className="text-[13px] sidebar-label">{t("nav.create_post", "Create post")}</span>}
          </button>
        )}

        {isAdmin ? (
          // Staff navigation (admin pages and their permissions) is a separate, access-controlled chunk
          <Suspense fallback={null}>
            <StaffNav collapsed={collapsed} onNavigate={onClose} />
          </Suspense>
        ) : (
          <NavSections sections={sections} collapsed={collapsed} onNavigate={onClose} />
        )}
      </nav>

      {/* ── FOOTER: mode + language in one row, then the account menu ── */}
      <div className="flex-shrink-0 space-y-2 border-t border-border p-2 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:pb-4">
        <div className={cn("grid gap-1", collapsed ? "grid-cols-1" : "grid-cols-2")}>
          <QuickThemeSwitcher collapsed={collapsed} compact />
          <LanguageToggle collapsed={collapsed} compact />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={t("nav.account_menu", "Account menu")}
              className={cn("ov-panel ov-panel-hover flex h-12 w-full items-center gap-2.5 px-2 sidebar-row", collapsed && "justify-center")}
            >
              <UserAvatar user={user ?? { username: "" }} size="sm" className="flex-shrink-0" />
              {!collapsed && (
                <>
                  <div className="min-w-0 flex-1 space-y-0.5 text-left sidebar-label">
                    <p className="truncate text-[13px] font-semibold leading-tight">{user?.username}</p>
                    <p className="ov-label truncate">{user?.role ? t(`admin.roles.${user.role}`, user.role) : null}</p>
                  </div>
                  <MoreHorizontal className="h-4 w-4 flex-shrink-0 text-muted-foreground sidebar-label" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-52">
            <DropdownMenuItem asChild>
              <Link href="/profile" onClick={onClose}>
                <User className="mr-2 h-3.5 w-3.5" /> {t("navbar.profile", "Profile")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/notifications" onClick={onClose}>
                <Bell className="mr-2 h-3.5 w-3.5" /> {t("navigation.notifications", "Notifications")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => logoutMutation.mutate()} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-3.5 w-3.5" /> {t("navbar.logout", "Log out")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CreatePostSelectorDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
