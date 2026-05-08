import React from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { 
  Home, 
  Search, 
  Bell, 
  MessageSquare, 
  Users, 
  User, 
  Shield, 
  LayoutDashboard, 
  Flag, 
  Ban, 
  Activity, 
  TrendingUp, 
  Trophy, 
  Zap, 
  Ticket,
  ArrowLeft,
  Settings,
  Menu,
  Sparkles,
  Bot,
  Palette,
  ShieldAlert,
  Radar,
  ShieldBan,
  BarChart3,
  Award
} from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";

interface SidebarProps {
  isAdmin?: boolean;
  user: any;
  onNavigate?: () => void;
  iconOnly?: boolean;
}

export function Sidebar({ isAdmin, user, onNavigate, iconOnly }: SidebarProps) {
  const [location] = useLocation();
  const { t } = useTranslation();

  const nav = isAdmin ? [
    { href: "/admin", label: t("admin.title", "Dashboard"), icon: LayoutDashboard },
    { href: "/admin/users", label: t("admin.tabs.users", "User Management"), icon: Users },
    { href: "/admin/reports", label: t("admin.tabs.reports", "Content Reports"), icon: Flag },
    { href: "/admin/bans", label: t("bans.title", "Security & Bans"), icon: ShieldBan },
    { href: "/admin/auto-punishments", label: t("autoPunishment.title", "Auto-Punishment Engine"), icon: Zap },
    { href: "/admin/analytics", label: t("analytics.title", "Product Analytics"), icon: BarChart3, ownerOnly: true },
    { href: "/admin/monitoring", label: t("admin.tabs.monitoring", "Monitoring System"), icon: Radar },
    { href: "/admin/logs", label: t("admin.tabs.logs", "Activity Logs"), icon: Activity },
    { href: "/admin/performance", label: t("modPerf.nav", "Mod Performance"), icon: Award, ownerOnly: true },
    { href: "/admin/settings", label: t("admin.tabs.settings", "Admin Settings"), icon: Settings },
  ] : [
    { href: "/feed/media", icon: Home, label: t("navbar.media_feed"), exact: true },
    { href: "/feed/discussions", icon: MessageSquare, label: t("navbar.discussions_feed") },
    { href: "/feed/communities", icon: Users, label: t("navbar.communities") },
    { href: "/notifications", icon: Bell, label: t("navigation.notifications") },
    { href: "/chat", icon: MessageSquare, label: t("navbar.messages", "Messages") },
    { href: "/profile", icon: User, label: t("navbar.profile") },
  ];

  const filteredNav = nav.filter(item => !item.ownerOnly || user?.role === "owner");

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* Brand Logo Area */}
      <div className={cn(
        "flex items-center h-16 border-b border-border/40 flex-shrink-0 transition-all",
        iconOnly ? "justify-center" : "px-6"
      )}>
        <Link href="/" className="flex items-center gap-3">
          <div className="h-9 w-9 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
            <span className="text-primary-foreground font-black text-xl">O</span>
          </div>
          {!iconOnly && (
            <span className="font-black text-xl tracking-tighter uppercase">Osiris</span>
          )}
        </Link>
      </div>

      {/* Navigation Area */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-1.5 scrollbar-none">
        {isAdmin && (
          <>
            <Link href="/">
              <div 
                onClick={onNavigate}
                className={cn(
                  "flex items-center rounded-2xl p-3 text-muted-foreground hover:bg-primary/5 hover:text-primary transition-all cursor-pointer group",
                  iconOnly ? "justify-center" : "gap-4 px-4"
                )}
              >
                <ArrowLeft className="h-5 w-5 flex-shrink-0 group-hover:-translate-x-1 transition-transform" />
                {!iconOnly && <span className="text-sm font-black uppercase tracking-tight">Back to App</span>}
              </div>
            </Link>
            <div className="h-[1px] bg-border/40 my-3 mx-2" />
          </>
        )}

        {filteredNav.map(item => {
          const isActive = item.exact ? location === item.href : location.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href}>
              <div 
                onClick={onNavigate}
                className={cn(
                  "flex items-center rounded-2xl transition-all duration-200 active:scale-[0.97] cursor-pointer group relative",
                  iconOnly ? "justify-center h-12 w-12 mx-auto" : "gap-4 px-4 py-3",
                  isActive 
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className={cn("h-5 w-5 flex-shrink-0", isActive ? "" : "opacity-60 group-hover:opacity-100")} strokeWidth={isActive ? 2.5 : 2} />
                {!iconOnly && <span className="text-sm font-bold truncate tracking-tight">{item.label}</span>}
                
                {isActive && iconOnly && (
                  <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-primary rounded-r-full" />
                )}
              </div>
            </Link>
          );
        })}

        {!isAdmin && (user?.isAdmin || ['admin', 'owner'].includes(user?.role)) && (
          <>
            <div className="h-[1px] bg-border/40 my-3 mx-2" />
            <Link href="/admin">
              <div 
                onClick={onNavigate}
                className={cn(
                  "flex items-center rounded-2xl p-3 text-primary bg-primary/5 hover:bg-primary/10 transition-all cursor-pointer",
                  iconOnly ? "justify-center" : "gap-4 px-4"
                )}
              >
                <Shield className="h-5 w-5 flex-shrink-0" />
                {!iconOnly && <span className="text-sm font-black uppercase tracking-tight">Admin Command</span>}
              </div>
            </Link>
          </>
        )}
      </nav>

      {/* User Area */}
      <div className="border-t border-border/40 p-4 bg-muted/5">
        {iconOnly ? (
          <div className="flex justify-center">
            <UserAvatar user={user} size="sm" />
          </div>
        ) : (
          <div className="flex items-center gap-3 bg-background/50 p-2 rounded-2xl border border-border/40">
            <UserAvatar user={user} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black truncate uppercase tracking-wider">{user?.username}</p>
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">{user?.role}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
