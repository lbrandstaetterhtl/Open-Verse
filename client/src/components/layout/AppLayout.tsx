import React, { ReactNode, useState, Suspense } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Menu, Bell, PenSquare, ArrowLeft, Search } from "lucide-react";
import { AppSidebar } from "./AppSidebar";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { SkeletonFeed } from "./skeleton-loaders";
import { useSiteSettings } from "@/hooks/use-site-settings";

/**
 * APP-LAYOUT [UI-L-002]: Claude.ai-style Responsive Layout
 *
 * Breakpoints:
 *  Mobile  (<768px):  Sidebar as overlay Drawer via Hamburger
 *  Tablet  (768-1023): Sidebar as icon-only Rail (56px, always visible)
 *  Desktop (≥1024px): Sidebar full (260px) or collapsed (56px)
 *
 * Single layout component — no conditional rendering between breakpoints.
 * Sidebar state persisted in localStorage.
 */

function getPageTitle(location: string): string {
  const titles: Record<string, string> = {
    "/": "Feed",
    "/feed/media": "Feed",
    "/feed/discussions": "Discussions",
    "/feed/communities": "Communities",
    "/notifications": "Notifications",
    "/chat": "Messages",
    "/profile": "My Profile",
    "/ai-generator": "AI Generator",
    "/theme-builder": "Theme Builder",
    "/create-community": "Create Community",
    "/mod-panel": "Mod Panel",
    "/tickets": "Tickets",
    "/admin": "Dashboard",
    "/admin/users": "User Management",
    "/admin/reports": "Content Reports",
    "/admin/bans": "Bans & Security",
    "/admin/auto-punishments": "Auto-Punishment",
    "/admin/monitoring": "Monitoring",
    "/admin/monitoring/activity": "Activity Logs",
    "/admin/monitoring/anomalies": "Anomalies",
    "/admin/analytics": "Analytics",
    "/admin/performance": "Mod Performance",
    "/admin/tickets": "All Tickets",
    "/admin/settings": "Admin Settings",
    "/admin/security/stress-test": "Stress Test",
  };

  for (const [path, title] of Object.entries(titles)) {
    if (location === path || location.startsWith(path + "/")) return title;
  }
  return "Osiris";
}

function MobileHeader({
  onOpenDrawer,
  location,
}: {
  onOpenDrawer: () => void;
  location: string;
}) {
  const { settings } = useSiteSettings();
  const isAdminArea = location.startsWith("/admin");

  return (
    <header className="lg:hidden flex items-center h-14 px-4 gap-3 border-b border-border/40 bg-background/80 backdrop-blur-xl flex-shrink-0 sticky top-0 z-30">
      <button
        onClick={onOpenDrawer}
        className="p-2 rounded-lg hover:bg-accent transition-colors -ml-2 text-muted-foreground hover:text-foreground"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <span className="font-bold text-base flex-1 truncate">
        {getPageTitle(location)}
      </span>

      {/* Context-aware header actions */}
      <div className="flex items-center gap-1">
        {isAdminArea ? (
          <Link href="/feed/media">
            <button className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground">
              <ArrowLeft className="h-5 w-5" />
            </button>
          </Link>
        ) : (
          <>
            <Link href="/notifications">
              <button className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground">
                <Bell className="h-5 w-5" />
              </button>
            </Link>
            {(location === "/feed/media" || location === "/") && (
              <Link href="/post/discussions">
                <button className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground">
                  <PenSquare className="h-5 w-5" />
                </button>
              </Link>
            )}
          </>
        )}
      </div>
    </header>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user } = useAuth();

  const isAdminArea = location.startsWith("/admin") || location.startsWith("/tickets");
  const isAuthPage = location === "/auth";

  // Sidebar collapse state (desktop only), persisted
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });

  // Mobile drawer open state
  const [drawerOpen, setDrawerOpen] = useState(false);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem("sidebar-collapsed", String(next));
    } catch {
      /* ignore */
    }
  };

  if (isAuthPage) {
    return (
      <Suspense fallback={null}>
        <main className="min-h-screen">{children}</main>
      </Suspense>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── MOBILE OVERLAY ── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* ── SIDEBAR ──
          Mobile:  fixed, off-screen by default, slides in as drawer
          Tablet:  always visible, 56px wide (icon-only via CSS)
          Desktop: visible, 260px or 56px (collapsed)
      */}
      <aside
        className={cn(
          // Base positioning
          "fixed inset-y-0 left-0 z-50 flex flex-col",
          // Background + border
          "bg-background/80 backdrop-blur-xl border-r border-white/10 shadow-[4px_0_24px_rgba(0,0,0,0.3)]",
          // Smooth transition
          "transition-all duration-300 ease-in-out",
          // Mobile: full-width drawer, slides in
          "w-[260px]",
          drawerOpen ? "translate-x-0" : "-translate-x-full",
          // Tablet: always visible, forced 56px wide (icons only via CSS tricks)
          "md:translate-x-0 md:w-[56px]",
          // Desktop: full or collapsed
          "lg:relative lg:z-auto",
          collapsed ? "lg:w-[56px]" : "lg:w-[260px]"
        )}
      >
        {/*
          On tablet (md, <lg): sidebar is always 56px.
          We pass `collapsed=true` semantics to AppSidebar for tablet via CSS,
          but the actual `collapsed` prop only controls desktop.
          We use a wrapper that forces icon-only on tablet.
        */}
        <div className="flex flex-col h-full overflow-hidden">
          {/* On tablet: hide text labels via CSS */}
          <style>{`
            @media (min-width: 768px) and (max-width: 1023px) {
              .sidebar-label { display: none !important; }
              .sidebar-row { justify-content: center !important; padding-left: 0.5rem !important; padding-right: 0.5rem !important; }
              .sidebar-toggle { display: none !important; }
              .sidebar-footer-text { display: none !important; }
            }
          `}</style>
          <AppSidebar
            isAdmin={isAdminArea}
            collapsed={collapsed}
            onToggleCollapse={toggleCollapsed}
            onClose={() => setDrawerOpen(false)}
          />
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header (hidden on lg+) */}
        <MobileHeader
          onOpenDrawer={() => setDrawerOpen(true)}
          location={location}
        />

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <Suspense
            fallback={
              <div className="p-8">
                <SkeletonFeed />
              </div>
            }
          >
            <div
              className={cn(
                "w-full mx-auto",
                isAdminArea
                  ? "max-w-none p-4 md:p-6 lg:p-8"
                  : "max-w-[1280px] p-4 md:p-6"
              )}
            >
              {children}
            </div>
          </Suspense>
        </main>

<<<<<<< HEAD
        {/* Mobile Bottom Tab Bar (non-admin only) */}
        {!isAdminArea && <MobileBottomNav />}
      </div>
=======
      {/* Persistent Bottom Tab Bar – visible only on mobile */}
      {!isAdminArea ? (
        <MobileBottomNav />
      ) : (
        <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-bottom-4 duration-500">
          <Link href="/">
            <Button className="rounded-full shadow-2xl gap-2 px-6 h-12 bg-primary text-primary-foreground hover:scale-105 transition-transform active:scale-95 border-2 border-background/20 backdrop-blur-sm">
              <ArrowLeft className="h-4 w-4" />
              <span className="font-bold text-sm">Social Feed</span>
            </Button>
          </Link>
        </div>
      )}
>>>>>>> 7eeb3e4 (feat: implement 'Weightless Universe' design overhaul, comprehensive documentation, and core storage fixes)
    </div>
  );
}
