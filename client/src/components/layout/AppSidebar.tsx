import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import {
  Home,
  MessageSquare,
  Users,
  Bell,
  User,
  Shield,
  LayoutDashboard,
  Flag,
  Activity,
  Zap,
  Ticket,
  ArrowLeft,
  Settings,
  ChevronLeft,
  ChevronRight,
  X,
  BarChart3,
  Award,
  ShieldAlert,
  Radar,
  ShieldBan,
  Bot,
  Palette,
  LogOut,
  MoreHorizontal,
  Menu,
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
        "flex items-center rounded-lg transition-all duration-150 cursor-pointer select-none group relative",
        "h-9",
        collapsed ? "justify-center px-2" : "px-3 gap-3",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
      onClick={hasSubItems ? () => setSubOpen((v) => !v) : onNavigate}
    >
      <item.icon
        className={cn(
          "h-[18px] w-[18px] flex-shrink-0 transition-transform",
          isActive ? "stroke-[2.5]" : "stroke-2",
          !collapsed && "group-hover:scale-105"
        )}
      />
      {!collapsed && (
        <span className="text-[13px] font-medium flex-1 truncate sidebar-label">
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
        <div className="ml-7 mt-0.5 space-y-0.5">
          {item.subItems!.map((sub) => {
            const subActive =
              location === sub.href || location.startsWith(sub.href + "/");
            return (
              <Link key={sub.href} href={sub.href} onClick={onNavigate}>
                <div
                  className={cn(
                    "h-8 flex items-center px-3 rounded-lg text-[12px] font-medium transition-all cursor-pointer",
                    subActive
                      ? "text-primary bg-primary/5"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
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
    { href: "/feed/discussions", icon: MessageSquare, label: t("navbar.discussions_feed", "Discussions") },
    { href: "/feed/communities", icon: Users, label: t("navbar.communities", "Communities") },
    { href: "/notifications", icon: Bell, label: t("navigation.notifications", "Notifications") },
    { href: "/chat", icon: MessageSquare, label: t("navbar.messages", "Messages") },
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
    { href: "/admin/auto-punishments", icon: Zap, label: t("autoPunishment.title", "Auto-Punishment"), permission: "security" },
    {
      href: "/admin/monitoring",
      icon: Radar,
      label: t("admin.tabs.monitoring", "Monitoring"),
      permission: "logs",
      subItems: [
        { href: "/admin/monitoring/activity", label: t("admin.tabs.logs", "Activity Logs") },
        { href: "/admin/monitoring/anomalies", label: "Anomalies" },
      ],
    },
    { href: "/admin/analytics", icon: BarChart3, label: t("analytics.title", "Analytics"), permission: "analytics" },
    { href: "/admin/performance", icon: Award, label: t("modPerf.nav", "Mod Performance"), permission: "performance" },
    { href: "/admin/tickets", icon: Ticket, label: "Tickets", permission: "tickets" },
    { href: "/admin/security/stress-test", icon: ShieldAlert, label: "Stress Test", ownerOnly: true },
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
      <div className="flex items-center h-14 px-3 border-b border-border/40 flex-shrink-0 gap-2">
        <Link href="/" onClick={onClose} className="flex items-center gap-2 flex-1 min-w-0">
          <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center flex-shrink-0 shadow-sm shadow-primary/30">
            <span className="text-primary-foreground text-sm font-black">O</span>
          </div>
          {!collapsed && (
            <span className="font-black text-[15px] tracking-tight truncate sidebar-label">Osiris</span>
          )}
        </Link>



        {/* Desktop Collapse Toggle */}
        <button
          onClick={onToggleCollapse}
          className="hidden lg:flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground flex-shrink-0 sidebar-toggle"
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
          className="lg:hidden flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent transition-colors text-muted-foreground flex-shrink-0"
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
                "flex items-center rounded-lg h-9 transition-all cursor-pointer gap-3 px-3 text-muted-foreground hover:bg-accent hover:text-foreground",
                collapsed && "justify-center px-2"
              )}>
                <ArrowLeft className="h-[18px] w-[18px] flex-shrink-0 stroke-2" />
                {!collapsed && <span className="text-[13px] font-medium sidebar-label">Back to App</span>}
              </div>
            </Link>
            <div className="my-2 mx-1 border-t border-border/40 sidebar-label" />
          </>
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
            <div className="my-2 mx-1 border-t border-border/40" />
            <NavItemRow
              item={{ href: "/admin", icon: Shield, label: "Admin Panel" }}
              collapsed={collapsed}
              onNavigate={onClose}
            />
          </>
        )}
      </nav>

      {/* ── USER FOOTER ── */}
      <div className="border-t border-border/40 p-2 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:pb-4 flex-shrink-0 space-y-0.5">
        {/* Quick Theme Switcher — always visible, ≤2 clicks */}
        <div className="flex flex-col gap-0.5">
          <QuickThemeSwitcher collapsed={collapsed} />
          <LanguageToggle collapsed={collapsed} />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "w-full flex items-center rounded-lg h-10 hover:bg-accent transition-colors gap-2.5 px-2",
                collapsed && "justify-center"
              )}
            >
              <UserAvatar user={user} size="sm" className="flex-shrink-0" />
              {!collapsed && (
                <>
                  <div className="flex-1 min-w-0 text-left sidebar-label">
                    <p className="text-[12px] font-semibold truncate leading-tight">
                      {user?.username}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate leading-tight capitalize">
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
