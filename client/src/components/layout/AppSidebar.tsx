import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { useNotificationCounts } from "@/hooks/use-notifications";
import {
  Home, Send, MessagesSquare, Users, Bell, User, Shield, LayoutDashboard, Flag, Zap, Ticket, ArrowLeft,
  Settings, ChevronLeft, ChevronRight, X, BarChart3, Award, ShieldAlert, Radar, ShieldBan, Bot, Palette,
  LogOut, MoreHorizontal, Sparkles, LifeBuoy, ScrollText, Gavel, Plus, UsersRound,
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

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  /** Other paths that also mark this item as active (e.g. "/" for the feed). */
  alsoActive?: string[];
  /** Only this exact path is active (not its sub-paths). */
  exact?: boolean;
  permission?: string;
  badge?: number;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

interface AppSidebarProps {
  isAdmin: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onClose: () => void;
}

function isItemActive(item: NavItem, location: string) {
  const paths = [item.href, ...(item.alsoActive ?? [])];
  return paths.some((p) => (item.exact || p === "/" ? location === p : location === p || location.startsWith(p + "/")));
}

function NavItemRow({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const [location] = useLocation();
  const { t } = useTranslation();
  const isActive = isItemActive(item, location);
  const badge = item.badge && item.badge > 0 ? (item.badge > 99 ? "99+" : String(item.badge)) : null;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "relative flex h-10 items-center rounded-sm transition-colors duration-150 select-none sidebar-row",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        collapsed ? "justify-center px-2" : "gap-3 px-3",
        isActive ? "ov-nav-active ov-cut" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
      )}
    >
      <item.icon className={cn("h-[18px] w-[18px] flex-shrink-0", isActive ? "stroke-[2.25] text-primary" : "stroke-2")} />
      {!collapsed && (
        <span className={cn("flex-1 truncate text-[13px] sidebar-label", isActive ? "font-semibold" : "font-medium")}>{item.label}</span>
      )}
      {badge && (
        <span
          className={cn(
            "font-data flex h-4 min-w-[16px] items-center justify-center rounded-xs bg-primary px-1 text-[10px] font-semibold tabular-nums text-primary-foreground",
            collapsed && "absolute right-1 top-1",
          )}
          aria-label={t("layout.sidebar.unread_badge", { badge, defaultValue: "{{badge}} unread" })}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

function SectionTitle({ children, collapsed }: { children: React.ReactNode; collapsed: boolean }) {
  if (collapsed) return <div className="mx-2 my-2 border-t border-border" aria-hidden="true" />;
  return <div className="ov-label px-3 pb-1.5 pt-3 sidebar-label">{children}</div>;
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

  const adminSections: NavSection[] = [
    {
      items: [{ href: "/admin", icon: LayoutDashboard, label: t("nav.admin_overview", "Overview"), exact: true, permission: "dashboard" }],
    },
    {
      title: t("nav.admin_people", "Users & content"),
      items: [
        { href: "/admin/users", icon: Users, label: t("admin.tabs.users", "Users"), permission: "users" },
        { href: "/admin/reports", icon: Flag, label: t("admin.tabs.reports", "Reports"), permission: "reports" },
        { href: "/admin/tickets", icon: Ticket, label: t("nav.tickets", "Tickets"), permission: "tickets" },
        { href: "/admin/groups", icon: UsersRound, label: t("nav.groups", "Groups"), permission: "groups" },
      ],
    },
    {
      title: t("nav.admin_moderation", "Moderation"),
      items: [
        { href: "/admin/bans", icon: ShieldBan, label: t("nav.bans", "Bans"), permission: "security" },
        { href: "/admin/auto-punishments", icon: Zap, label: t("nav.auto_actions", "Automatic actions"), permission: "auto_punishment" },
        { href: "/admin/performance", icon: Award, label: t("nav.mod_performance", "Moderator performance"), permission: "performance" },
      ],
    },
    {
      title: t("nav.admin_system", "System"),
      items: [
        { href: "/admin/monitoring", icon: Radar, label: t("nav.monitoring", "Monitoring"), exact: true, permission: "logs" },
        { href: "/admin/monitoring/activity", icon: ScrollText, label: t("nav.logs", "Logs"), alsoActive: ["/admin/logs"], permission: "logs" },
        { href: "/admin/analytics", icon: BarChart3, label: t("nav.analytics", "Analytics"), permission: "analytics" },
        { href: "/admin/security/stress-test", icon: ShieldAlert, label: t("nav.stress_test", "Stress test"), permission: "stress_test" },
        { href: "/admin/settings", icon: Settings, label: t("admin.tabs.settings", "Settings"), permission: "settings" },
      ],
    },
  ];

  const allowed = (item: NavItem) => user?.role === "owner" || !item.permission || hasPermission(item.permission);
  const sections = (isAdmin ? adminSections : appSections)
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

        {sections.map((section, i) => (
          <div key={section.title ?? i} role="group" aria-label={section.title}>
            {section.title && <SectionTitle collapsed={collapsed}>{section.title}</SectionTitle>}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavItemRow key={item.href} item={item} collapsed={collapsed} onNavigate={onClose} />
              ))}
            </div>
          </div>
        ))}
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
                    <p className="ov-label truncate">{user?.role}</p>
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
