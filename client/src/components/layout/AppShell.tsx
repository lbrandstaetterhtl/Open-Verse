import React, { Suspense } from "react";
import { useLocation, Link } from "wouter";
import { Navbar } from "./navbar";
import { Footer } from "./footer";
import { MobileLayout } from "./MobileLayout";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { 
  Shield, 
  Users, 
  Flag, 
  Activity, 
  Settings, 
  ChevronLeft,
  LayoutDashboard,
  Radar,
  ShieldBan,
  Zap,
  BarChart3,
  Award,
  ShieldAlert
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { SkeletonFeed } from "./skeleton-loaders";

/**
 * NAV-FIX [NAV-003]: Unified AppShell
 * This component stays mounted during navigation, providing a persistent
 * framework that eliminates layout flashes and reloads.
 */

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  const { t } = useTranslation();

  const isAdminArea = location.startsWith("/admin") || location.startsWith("/tickets");
  const isAuthPage = location === "/auth";

  if (isAuthPage) {
    return <main className="min-h-screen">{children}</main>;
  }

  const adminNavItems = [
    { href: "/admin", label: t("admin.title", "Dashboard"), icon: LayoutDashboard },
    { href: "/admin/users", label: t("admin.tabs.users", "User Management"), icon: Users },
    { href: "/admin/reports", label: t("admin.tabs.reports", "Content Reports"), icon: Flag },
    { href: "/admin/bans", label: t("bans.title", "Security & Bans"), icon: ShieldBan },
    { href: "/admin/auto-punishments", label: t("autoPunishment.title", "Auto-Punishment Engine"), icon: Zap },
    { href: "/admin/analytics", label: t("analytics.title", "Product Analytics"), icon: BarChart3, ownerOnly: true },
    { href: "/admin/monitoring", label: t("admin.tabs.monitoring", "Monitoring System"), icon: Radar },
    { href: "/admin/logs", label: t("admin.tabs.logs", "Activity Logs"), icon: Activity },
    { href: "/admin/performance", label: t("modPerf.nav", "Mod Performance"), icon: Award, ownerOnly: true },
    { href: "/admin/security/stress-test", label: t("security.stress_test", "Platform Stress Test"), icon: ShieldAlert, ownerOnly: true },
    { href: "/admin/settings", label: t("admin.tabs.settings", "Admin Settings"), icon: Settings },
  ];

  const filteredAdminNav = adminNavItems.filter(item => !item.ownerOnly || user?.role === "owner");

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Navbar />
      
      <div className="flex flex-1 pt-14 relative overflow-hidden">
        {/* Persistent Sidebar for Admin Area */}
        {isAdminArea && user && (
          <aside className="hidden lg:flex w-64 border-r bg-card flex-col z-30 shrink-0 sticky top-14 h-[calc(100vh-3.5rem)] animate-fade-in duration-300">
            <div className="p-6 flex items-center gap-3 border-b mb-4">
              <div className="bg-primary/10 p-2 rounded-lg text-primary">
                <Shield className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h1 className="font-bold text-lg tracking-tight truncate">Osiris Admin</h1>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Command Center</p>
              </div>
            </div>

            <nav className="flex-1 px-4 space-y-1 overflow-y-auto scrollbar-none">
              {filteredAdminNav.map((item) => {
                const isActive = location === item.href;
                return (
                  <Link key={item.href} href={item.href}>
                    <div className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all group relative cursor-pointer",
                      isActive 
                        ? "bg-primary text-primary-foreground shadow-md" 
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}>
                      <item.icon className={cn("h-4 w-4", isActive ? "" : "text-muted-foreground group-hover:text-foreground")} />
                      <span className="truncate">{item.label}</span>
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 bg-primary-foreground/40 rounded-r-full" />
                      )}
                    </div>
                  </Link>
                );
              })}
            </nav>

            <div className="p-4 border-t bg-muted/10">
              <Link href="/">
                <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground">
                  <ChevronLeft className="h-4 w-4" />
                  {t("admin.back_to_site", "Back to Site")}
                </Button>
              </Link>
            </div>
          </aside>
        )}

        {/* Main Content Pane */}
        <main className={cn(
          "flex-1 flex flex-col relative min-w-0",
          isAdminArea && "bg-muted/10"
        )}>
          {/* NAV-FIX [NAV-007]: Suspense boundary is INSIDE the shell */}
          <Suspense fallback={
            <div className="p-8">
              <SkeletonFeed />
            </div>
          }>
            <div className={cn(
              "flex-1 w-full",
              isAdminArea ? "p-4 md:p-8" : "container max-w-[1280px] mx-auto",
            )}>
              {isAdminArea ? (
                children
              ) : (
                <MobileLayout>
                  {children}
                </MobileLayout>
              )}
            </div>
          </Suspense>
          
          <Footer />
        </main>
      </div>
    </div>
  );
}
