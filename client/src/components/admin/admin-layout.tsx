import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  Shield, 
  Users, 
  Flag, 
  Activity, 
  Settings, 
  ChevronLeft,
  LayoutDashboard,
  Search,
  Bell,
  User
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { user } = useAuth();
  const [location] = useLocation();
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Ctrl+K to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('admin-global-search')?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const navItems = [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/users", label: "User Management", icon: Users },
    { href: "/admin/reports", label: "Content Reports", icon: Flag },
    { href: "/admin/logs", label: "Activity Logs", icon: Activity },
    { href: "/admin/settings", label: "Admin Settings", icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-muted/30 overflow-hidden">
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
        {/* Top Header */}
        <header className="h-16 border-b bg-card px-8 flex items-center justify-between z-20 shrink-0">
          <div className="flex items-center gap-6 flex-1 max-w-2xl">
            <div className="relative flex-1 group">
              <Search className={cn(
                "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors",
                isSearchFocused ? "text-primary" : "text-muted-foreground"
              )} />
              <Input 
                id="admin-global-search"
                placeholder="Search anything... (Ctrl+K)" 
                className="pl-10 h-9 bg-muted/50 border-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:bg-card transition-all"
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="relative group">
              <Bell className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full border-2 border-card" />
            </Button>
            <div className="flex items-center gap-3 pl-4 border-l">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold leading-tight">{user?.username}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">{user?.role}</p>
              </div>
              <div className="bg-primary/10 p-2 rounded-full border border-primary/20">
                <User className="h-5 w-5 text-primary" />
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Content Pane */}
        <main className="flex-1 overflow-auto bg-muted/10 p-8 scrollbar-thin scrollbar-thumb-muted-foreground/10 scrollbar-track-transparent">
          {children}
        </main>
      </div>
    </div>
  );
}
