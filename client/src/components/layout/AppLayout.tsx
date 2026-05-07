import React, { ReactNode, useState, Suspense } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { 
  Menu, 
  X, 
  PenSquare, 
  Home, 
  Search, 
  Bell, 
  User, 
  Shield, 
  ArrowLeft 
} from "lucide-react";
import { Sidebar } from "./sidebar";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { SkeletonFeed } from "./skeleton-loaders";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";

/**
 * APP-LAYOUT [UI-L-001]: Principal Responsive Layout
 * Handles Mobile Drawer, Tablet Icon-Sidebar, and Desktop Full-Sidebar.
 */

export function AppLayout({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user } = useAuth();
  const [location] = useLocation();
  const { t } = useTranslation();
  
  const isAdminArea = location.startsWith('/admin') || location.startsWith('/tickets');

  function getTitle(loc: string) {
    if (loc === '/') return 'Osiris';
    if (loc.startsWith('/feed/media')) return t('navbar.media_feed');
    if (loc.startsWith('/feed/discussions')) return t('navbar.discussions_feed');
    if (loc.startsWith('/feed/communities')) return t('navbar.communities');
    if (loc.startsWith('/notifications')) return t('navbar.notifications');
    if (loc.startsWith('/profile')) return t('navbar.profile');
    if (loc.startsWith('/admin')) return t('navbar.admin');
    if (loc.startsWith('/tickets')) return t('navbar.support');
    return 'Osiris';
  }

  return (
    <div className="min-h-screen bg-background selection:bg-primary/20">

      {/* Mobile Drawer Overlay */}
      <AnimatePresence>
        {drawerOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm md:hidden" 
            onClick={() => setDrawerOpen(false)} 
          />
        )}
      </AnimatePresence>

      {/* Mobile Drawer (Sidebar) */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-[110] w-[280px] bg-background border-r md:hidden',
        'transition-transform duration-500 ease-in-out shadow-2xl',
        'pt-[env(safe-area-inset-top,0px)]',
        drawerOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        <Sidebar 
          isAdmin={isAdminArea} 
          user={user!} 
          onNavigate={() => setDrawerOpen(false)} 
        />
        {/* Close Button on Drawer */}
        <button 
          onClick={() => setDrawerOpen(false)} 
          className="absolute top-4 right-4 p-2 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </aside>

      {/* Desktop Sidebar: Icons-only auf Tablet (md), voll auf Desktop (lg) */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 flex-col border-r bg-card w-[72px] lg:w-64 transition-all duration-300">
        <Sidebar 
          isAdmin={isAdminArea} 
          user={user!} 
          iconOnly 
        />
        <div className="hidden lg:block absolute inset-0 pointer-events-none">
           {/* Replace iconOnly sidebar with full sidebar on lg */}
           <div className="opacity-0 lg:opacity-100 pointer-events-auto h-full w-full">
              <Sidebar isAdmin={isAdminArea} user={user!} />
           </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className={cn(
        "flex flex-col min-h-screen transition-all duration-300",
        "md:ml-[72px] lg:ml-64"
      )}>

        {/* Mobile Header (Sticky) */}
        <header className="md:hidden sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b pt-[env(safe-area-inset-top,0px)]">
          <div className="flex items-center h-14 px-4 gap-3">
            <button 
              onClick={() => setDrawerOpen(true)} 
              className="p-2 rounded-xl hover:bg-muted active:scale-90 transition-all"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="font-black text-lg tracking-tight flex-1 truncate uppercase">
              {getTitle(location)}
            </span>
            <div className="flex items-center gap-1">
              {!isAdminArea && (
                <Link href="/post/news">
                  <button className="p-2 rounded-xl text-primary hover:bg-primary/5 active:scale-90 transition-all">
                    <PenSquare className="h-5 w-5" />
                  </button>
                </Link>
              )}
            </div>
          </div>
        </header>

        <main className={cn(
          "flex-1 relative",
          // Mobile padding for Bottom Tab Bar
          "pb-[calc(56px+env(safe-area-inset-bottom,0px))] md:pb-0",
          isAdminArea && "bg-muted/10"
        )}>
          <Suspense fallback={<div className="p-8"><SkeletonFeed /></div>}>
            <div className={cn(
              "w-full mx-auto",
              isAdminArea ? "max-w-none p-4 md:p-8 lg:p-10" : "max-w-[1280px]"
            )}>
              {children}
            </div>
          </Suspense>
        </main>
      </div>

      {/* Persistent Bottom Tab Bar – visible only on mobile */}
      {!isAdminArea && <MobileBottomNav />}
    </div>
  );
}
