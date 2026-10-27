import React, { ReactNode, useState, Suspense } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Menu, Bell, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNotificationCounts } from "@/hooks/use-notifications";
import { AppSidebar } from "./AppSidebar";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { SkeletonFeed } from "./skeleton-loaders";
import { isStaffUser } from "@/lib/staff";

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

/** Phone header: menu, brand and one context action. The page title lives in each page's own header. */
function MobileHeader({ onOpenDrawer, isAdminArea }: { onOpenDrawer: () => void; isAdminArea: boolean }) {
  const { t } = useTranslation();
  const { data: counts } = useNotificationCounts();
  const unread = counts?.unread ?? 0;
  const iconButton = "relative flex h-10 w-10 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <header className="sticky top-0 z-30 flex h-14 flex-shrink-0 items-center gap-2 border-b border-border bg-background/95 px-2 lg:hidden">
      <button onClick={onOpenDrawer} className={iconButton} aria-label={t("nav.open_menu", "Open menu")}>
        <Menu className="h-5 w-5" />
      </button>

      <Link href={isAdminArea ? "/admin" : "/"} className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate font-display text-base font-semibold">Osiris</span>
        {isAdminArea && <span className="ov-label">{t("navbar.section_admin", "Administration")}</span>}
      </Link>

      {isAdminArea ? (
        <Link href="/feed/media" className={cn(iconButton, "w-auto gap-1.5 px-3 text-[13px] font-medium")}>
          <ArrowLeft className="h-4 w-4" />
          {t("nav.to_app", "App")}
        </Link>
      ) : (
        <Link href="/notifications" className={iconButton} aria-label={t("navigation.notifications", "Notifications")}>
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="font-data absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-xs border border-background bg-primary px-1 text-[10px] font-semibold tabular-nums text-primary-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Link>
      )}
    </header>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user } = useAuth();

  // Staff only: everyone else is sent away from /admin by StaffArea and keeps the normal navigation
  const isAdminArea = location.startsWith("/admin") && isStaffUser(user);
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
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
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
          "bg-background/95 lg:bg-background/80 border-r border-border",
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

      {/* ── MAIN CONTENT ── (offset by the fixed 56px rail on tablets) */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden md:pl-[56px] lg:pl-0">
        {/* Mobile Header (hidden on lg+) */}
        <MobileHeader
          onOpenDrawer={() => setDrawerOpen(true)}
          isAdminArea={isAdminArea}
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

        {/* Bottom tab bar on phones; the admin area returns to the app via its header link instead. */}
        {!isAdminArea && <MobileBottomNav />}
      </div>
    </div>
  );
}
