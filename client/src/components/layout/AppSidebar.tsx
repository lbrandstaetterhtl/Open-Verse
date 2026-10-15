import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { Home, Send, MessagesSquare, Users, Bell, User, Shield, LayoutDashboard, Flag, Activity, Zap, Ticket, ArrowLeft, Settings, ChevronLeft, ChevronRight, X, BarChart3, Award, ShieldAlert, Radar, ShieldBan, Bot, Palette, LogOut, MoreHorizontal, Menu, Sparkles } from "lucide-react";
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

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  exact?: boolean;
  ownerOnly?: boolean;
  adminOnly?: boolean;
  permission?: string;
  subItems?: { href: string; label: string }[];
}

interface AppSidebarProps {
  isAdmin: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onClose: () => void;
}

function NavItemRow({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const [location] = useLocation();
  const [subOpen, setSubOpen] = useState(false);
  const isActive = item.exact
    ? location === item.href
    : location.startsWith(item.href);
  const hasSubItems = !!item.subItems?.length;

  // Auto-open sub-items if a sub-route is active
  useEffect(() => {
    if (hasSubItems && item.subItems!.some((s) => location.startsWith(s.href))) {
      setSubOpen(true);
    }
  }, [location]);

  const rowContent = (
    <div
      className={cn(
        "flex items-center rounded-sm transition-colors duration-150 cursor-pointer select-none group relative sidebar-row",
        "h-10",
        collapsed ? "justify-center px-2" : "px-3 gap-3",
        isActive
          ? "ov-nav-active ov-cut"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
      )}
      onClick={hasSubItems ? () => setSubOpen((v) => !v) : onNavigate}
    >
      <item.icon
        className={cn(
          "h-[18px] w-[18px] flex-shrink-0",
          isActive ? "stroke-[2.25] text-primary" : "stroke-2"
        )}
      />
      {!collapsed && (
        <span className={cn("text-[13px] flex-1 truncate sidebar-label", isActive ? "font-semibold" : "font-medium")}>
          {item.label}
        </span>
      )}
      {!collapsed && hasSubItems && (
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-200 sidebar-label",
            subOpen && "rotate-90"
          )}
        />
      )}
    </div>
  );

  return (
    <div>
      {hasSubItems ? (
        rowContent
      ) : (
        <Link href={item.href} onClick={onNavigate}>
          {rowContent}
        </Link>
      )}

      {/* Sub-items (desktop only, when not collapsed) */}
      {hasSubItems && subOpen && !collapsed && (
        <div className="ml-5 mt-0.5 space-y-0.5 border-l border-border pl-2">
          {item.subItems!.map((sub) => {
            const subActive =
              location === sub.href || location.startsWith(sub.href + "/");
            return (
              <Link key={sub.href} href={sub.href} onClick={onNavigate}>
                <div
                  className={cn(
                    "h-8 flex items-center px-3 rounded-sm text-[12px] font-medium transition-colors cursor-pointer",
                    subActive
                      ? "ov-nav-active ov-cut font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                  )}
                >
                  {sub.label}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AppSidebar({ isAdmin, collapsed, onToggleCollapse, onClose }: AppSidebarProps) {
  const { t } = useTranslation();
  const { user, logoutMutation, hasPermission } = useAuth();

  const publicNav: NavItem[] = [
    { href: "/feed/media", icon: Home, label: t("navbar.media_feed", "Feed"), exact: true },
    { href: "/feed/discussions", icon: MessagesSquare, label: t("navbar.discussions_feed", "Discussions") },
    { href: "/feed/communities", icon: Users, label: t("navbar.communities", "Communities") },
    { href: "/notifications", icon: Bell, label: t("navigation.notifications", "Notifications") },
    { href: "/chat", icon: Send, label: t("navbar.messages", "Messages") },
    { href: "/ai-generator", icon: Bot, label: "AI Generator" },
    { href: "/theme-builder", icon: Palette, label: "Theme Builder" },
    { href: "/profile", icon: User, label: t("navbar.profile", "Profile") },
  ];

  const adminNav: NavItem[] = [
    { href: "/admin", icon: LayoutDashboard, label: "Dashboard", exact: true, permission: "dashboard" },
    { href: "/admin/users", icon: Users, label: t("admin.tabs.users", "Users"), permission: "users" },
    { href: "/admin/reports", icon: Flag, label: t("admin.tabs.reports", "Reports"), permission: "reports" },
    { href: "/admin/groups", icon: Shield, label: "Groups", permission: "groups" },
    { href: "/admin/bans", icon: ShieldBan, label: t("bans.title", "Bans & Security"), permission: "security" },
    { href: "/admin/auto-punishments", icon: Zap, label: t("autoPunishment.title", "Auto-Punishment"), permission: "auto_punishment" },
    {
      href: "/admin/monitoring",
      icon: Radar,
      label: t("admin.tabs.monitoring", "Monitoring"),
      permission: "logs",
      subItems: [
        { href: "/admin/monitoring/activity", label: t("admin.tabs.logs", "Activity Logs") },
      ],
    },
    { href: "/admin/analytics", icon: BarChart3, label: t("analytics.title", "Analytics"), permission: "analytics" },
    { href: "/admin/performance", icon: Award, label: t("modPerf.nav", "Mod Performance"), permission: "performance" },
    { href: "/admin/tickets", icon: Ticket, label: "Tickets", permission: "tickets" },
    { href: "/admin/security/stress-test", icon: ShieldAlert, label: "Stress Test", permission: "stress_test" },
    { href: "/admin/settings", icon: Settings, label: t("admin.tabs.settings", "Settings"), permission: "settings" },
  ];

  const navItems = isAdmin
    ? adminNav.filter((item) => {
        if (user?.role === "owner") return true;
        if (item.ownerOnly) return false;
        if (item.permission) return hasPermission(item.permission);
        return true;
      })
    : publicNav;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── HEADER ── */}
      <div className={cn(
        "flex items-center h-14 px-3 border-b border-border flex-shrink-0 gap-2",
        collapsed && "lg:justify-center"
      )}>
        <Link
          href="/"
          onClick={onClose}
          className={cn("flex items-center gap-2.5 flex-1 min-w-0", collapsed && "lg:hidden")}
        >
          <div className="ov-panel h-8 w-8 flex items-center justify-center flex-shrink-0">
            <Sparkles className="h-4 w-4 text-star fill-current" aria-hidden="true" />
          </div>
          {!collapsed && (
            <span className="font-display font-semibold text-[16px] truncate sidebar-label">Osiris</span>
          )}
        </Link>

        {/* Desktop Collapse Toggle */}
        <button
          onClick={onToggleCollapse}
          className="hidden lg:flex items-center justify-center h-7 w-7 rounded-sm hover:bg-foreground/5 transition-colors text-muted-foreground hover:text-foreground flex-shrink-0 sidebar-toggle"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>

        {/* Mobile Close */}
        <button
          onClick={onClose}
          aria-label="Close menu"
          className="md:hidden flex items-center justify-center h-7 w-7 rounded-sm hover:bg-foreground/5 hover:text-foreground transition-colors text-muted-foreground flex-shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── NAVIGATION ── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-0.5 scrollbar-none">
        {/* Back to App (Admin mode) */}
        {isAdmin && (
          <>
            <Link href="/feed/media" onClick={onClose}>
              <div className={cn(
                "flex items-center rounded-sm h-10 transition-colors cursor-pointer gap-3 px-3 text-muted-foreground hover:bg-foreground/5 hover:text-foreground sidebar-row",
                collapsed && "justify-center px-2"
              )}>
                <ArrowLeft className="h-[18px] w-[18px] flex-shrink-0 stroke-2" />
                {!collapsed && <span className="text-[13px] font-medium sidebar-label">Back to App</span>}
              </div>
            </Link>
            <div className="my-2 mx-1 border-t border-border sidebar-label" />
          </>
        )}

        {/* Section heading */}
        {!collapsed && (
          <div className="ov-label px-3 pt-1 pb-2 sidebar-label">
            {isAdmin
              ? t("navbar.section_admin", "Administration")
              : t("navbar.navigation", "Navigation")}
          </div>
        )}

        {navItems.map((item) => (
          <NavItemRow
            key={item.href}
            item={item}
            collapsed={collapsed}
            onNavigate={onClose}
          />
        ))}

        {/* Admin link for admins in public mode */}
        {!isAdmin && ["admin", "owner"].includes(user?.role ?? "") && (
          <>
            <div className="my-2 mx-1 border-t border-border" />
            {!collapsed && (
              <div className="ov-label px-3 pt-1 pb-2 sidebar-label">
                {t("navbar.section_admin", "Administration")}
              </div>
            )}
            <NavItemRow
              item={{ href: "/admin", icon: Shield, label: "Admin Panel" }}
              collapsed={collapsed}
              onNavigate={onClose}
            />
          </>
        )}
      </nav>

      {/* ── USER FOOTER ── */}
      <div className="border-t border-border p-2 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:pb-4 flex-shrink-0 space-y-2">
        {/* Quick Theme Switcher — always visible, ≤2 clicks */}
        <div className="flex flex-col gap-0.5">
          <QuickThemeSwitcher collapsed={collapsed} />
          <LanguageToggle collapsed={collapsed} />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "ov-panel ov-panel-hover w-full flex items-center h-12 gap-2.5 px-2 sidebar-row",
                collapsed && "justify-center"
              )}
            >
              <UserAvatar user={user} size="sm" className="flex-shrink-0" />
              {!collapsed && (
                <>
                  <div className="flex-1 min-w-0 text-left space-y-0.5 sidebar-label">
                    <p className="text-[13px] font-semibold truncate leading-tight">
                      {user?.username}
                    </p>
                    <p className="ov-label truncate">
                      {user?.role}
                    </p>
                  </div>
                  <MoreHorizontal className="h-4 w-4 text-muted-foreground flex-shrink-0 sidebar-label" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-48">
            <DropdownMenuItem asChild>
              <Link href="/profile">
                <User className="h-3.5 w-3.5 mr-2" /> Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/theme-builder">
                <Palette className="h-3.5 w-3.5 mr-2" /> Theme Builder
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => logoutMutation.mutate()}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="h-3.5 w-3.5 mr-2" /> Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
