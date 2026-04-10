import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { cn } from "@/lib/utils";
import { 
  Shield, 
  Users, 
  Flag, 
  Activity, 
  Settings, 
  ChevronLeft,
  LayoutDashboard,
  Radar
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface AdminLayoutProps {
  children: React.ReactNode;
}

import { useTranslation } from "react-i18next";

export function AdminLayout({ children }: AdminLayoutProps) {
  const { user } = useAuth();
  const [location] = useLocation();
  const { t } = useTranslation();

  const navItems = [
    { href: "/admin", label: t("admin.title", "Dashboard"), icon: LayoutDashboard },
    { href: "/admin/users", label: t("admin.tabs.users", "User Management"), icon: Users },
    { href: "/admin/reports", label: t("admin.tabs.reports", "Content Reports"), icon: Flag },
    { href: "/admin/monitoring", label: t("admin.tabs.monitoring", "Monitoring System"), icon: Radar },
    { href: "/admin/logs", label: t("admin.tabs.logs", "Activity Logs"), icon: Activity },
    { href: "/admin/settings", label: t("admin.tabs.settings", "Admin Settings"), icon: Settings },
  ];

  return (
    <>
      <Navbar />
      <div className="flex h-[calc(100vh-3.5rem)] bg-muted/30 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card flex flex-col z-30 shrink-0">
        <div className="p-6 flex items-center gap-3 border-b mb-4">
          <div className="bg-primary/10 p-2 rounded-lg">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight">Osiris Admin</h1>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Command Center</p>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all group relative",
                  isActive 
                    ? "bg-primary text-primary-foreground shadow-sm" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className={cn("h-4 w-4", isActive ? "" : "text-muted-foreground group-hover:text-foreground")} />
                {item.label}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 bg-primary-foreground/40 rounded-r-full" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t bg-muted/10">
          <Link href="/">
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground">
              <ChevronLeft className="h-4 w-4" />
              Back to Site
            </Button>
          </Link>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Scrollable Content Pane */}
        <main className="flex-1 overflow-auto bg-muted/10 p-8 scrollbar-thin scrollbar-thumb-muted-foreground/10 scrollbar-track-transparent">
          {children}
        </main>
      </div>
      </div>
    </>
  );
}
