import { useTranslation } from "react-i18next";
import React from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  MessageSquare,
  Newspaper,
  MessageCircle,
  Users,
  Menu,
} from "lucide-react";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ModeToggle } from "@/components/theme/mode-toggle";
import { LanguageToggle } from "@/components/theme/language-toggle";
import { OpenVerseIcon } from "@/components/icons/open-verse-icon";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { UserMenu } from "./user-menu";
import { motion, AnimatePresence } from "framer-motion";

/**
 * REDESIGN [UX-002]: Consolidated navigation for maximum clarity.
 * Feeds are centered and prominent. Secondary tools and admin actions are tucked into the UserMenu.
 */

export function Navbar() {
  const { t } = useTranslation();
  const [location] = useLocation();
  const { user } = useAuth();
  const { settings } = useSiteSettings();
  const [wsStatus, setWsStatus] = import.meta.env.SSR ? [null, null] : React.useState<"connected" | "disconnected">("disconnected");

  React.useEffect(() => {
    const handleStatus = (e: any) => setWsStatus(e.detail);
    window.addEventListener("open-verse-ws-status", handleStatus);
    return () => window.removeEventListener("open-verse-ws-status", handleStatus);
  }, []);

  const primaryLinks = [
    { href: "/feed/media", icon: Newspaper, label: t("navbar.media_feed") },
    { href: "/feed/discussions", icon: MessageSquare, label: t("navbar.discussions_feed") },
    { href: "/feed/communities", icon: Users, label: t("navbar.communities") },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-[100] transition-all duration-500 overflow-visible">
      {/* Premium Top Border Light Reflect */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-50" />
      
      <div className="glass-premium nav-blur border-b h-14">
        <div className="w-full flex h-full items-center px-4 md:px-6 relative">
          
          {/* Brand & Mobile Menu (Left) */}
          <div className="flex items-center gap-4">
            <div className="md:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="hover:bg-primary/5 rounded-full transition-all active:scale-90">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[320px] p-0 flex flex-col glass-premium border-r border-border/40">
                  <SheetHeader className="p-8 border-b text-left bg-gradient-to-br from-primary/5 to-transparent">
                    <motion.div 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-4"
                    >
                      <div className="h-12 w-12 bg-primary flex items-center justify-center rounded-2xl rotate-3 shadow-lg shadow-primary/20">
                        <OpenVerseIcon className="h-7 w-auto text-primary-foreground -rotate-3" />
                      </div>
                      <SheetTitle className="font-black text-2xl tracking-tighter text-foreground">
                        {settings.site_name}
                      </SheetTitle>
                    </motion.div>
                  </SheetHeader>
                  
                  <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    <div className="space-y-3">
                      <p className="text-[11px] font-black text-primary uppercase tracking-[0.2em] px-4 mb-4 opacity-70">
                        {t("navbar.navigation", "Navigation")}
                      </p>
                      <div className="grid gap-2">
                        {primaryLinks.map((link, idx) => (
                          <Link key={link.href} href={link.href}>
                            <motion.div
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.1 }}
                            >
                              <Button
                                variant={location === link.href ? "secondary" : "ghost"}
                                className={cn(
                                  "w-full justify-start gap-4 h-14 px-5 rounded-2xl transition-all border border-transparent",
                                  location === link.href ? "bg-primary/10 text-primary font-bold border-primary/10 shadow-sm" : "hover:bg-muted/50"
                                )}
                              >
                                <link.icon className={cn("h-5 w-5", location === link.href ? "text-primary" : "opacity-40")} />
                                <span className="text-sm">{link.label}</span>
                              </Button>
                            </motion.div>
                          </Link>
                        ))}
                      </div>
                    </div>

                    <div className="p-6 bg-primary/5 rounded-3xl border border-primary/10 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -mr-12 -mt-12 transition-transform group-hover:scale-125" />
                      <p className="text-xs text-muted-foreground leading-relaxed relative z-10">
                        {t("navbar.mobile_footer_hint", "Explore premium tools like AI Generator and Support via the User Menu on Desktop.")}
                      </p>
                    </div>

                    <div className="flex items-center justify-between px-4 py-2 bg-muted/20 rounded-2xl">
                      <span className="text-xs font-medium text-muted-foreground">{t("navbar.settings", "Settings")}</span>
                      <div className="flex items-center gap-2">
                        <LanguageToggle />
                        <ModeToggle />
                      </div>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            <Link href="/" className="flex items-center gap-3 group">
              <motion.div 
                whileHover={{ scale: 1.05, rotate: [0, -5, 5, 0] }}
                className="h-9 w-9 bg-primary rounded-xl flex items-center justify-center shadow-md shadow-primary/20 group-hover:shadow-primary/40 transition-shadow"
              >
                <OpenVerseIcon className="h-5 w-auto text-primary-foreground" />
              </motion.div>
              <span className="font-black text-lg tracking-tighter hidden sm:inline-block bg-clip-text text-transparent bg-gradient-to-br from-foreground to-foreground/60">
                {settings.site_name.toUpperCase()}
              </span>
              {user && (
                <div className={cn(
                  "h-1.5 w-1.5 rounded-full mt-1 transition-colors duration-500 shadow-[0_0_8px_rgba(var(--primary),0.5)]",
                  wsStatus === "connected" ? "bg-emerald-500" : "bg-destructive animate-pulse"
                )} title={wsStatus === "connected" ? "Live Connected" : "Connection Lost - Retrying..."} />
              )}
            </Link>
          </div>

          {/* Liquid Navigation (Center) - Desktop Only */}
          <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center justify-center z-[10]">
            <div className="bg-muted/30 p-1.5 rounded-full flex items-center gap-1 border border-border/40 relative">
              {primaryLinks.map((link) => {
                const isActive = location === link.href;
                return (
                  <Link key={link.href} href={link.href}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "px-4 h-8 rounded-full text-[11px] font-bold gap-2 relative transition-colors z-10",
                        isActive ? "text-primary active-glow" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="active-pill"
                          className="absolute inset-0 bg-background rounded-full shadow-sm z-[-1]"
                          transition={{ type: "spring", stiffness: 380, damping: 30 }}
                        />
                      )}
                      <link.icon className={cn("h-3.5 w-3.5 transition-transform duration-300", isActive && "scale-110")} />
                      <span className="uppercase tracking-wider">{link.label}</span>
                    </Button>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Global Tools & Account (Right) */}
          <div className="flex items-center gap-1 sm:gap-2 ml-auto">
            {/* Chat + Notifications: visible on all sizes (bottom nav handles mobile tabs) */}
            <div className="flex items-center">
              <Link href="/chat">
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary transition-colors active:scale-90">
                  <MessageCircle className="h-4 w-4" />
                </Button>
              </Link>
              <NotificationBell />
            </div>
            
            <div className="hidden sm:flex items-center gap-1">
              <LanguageToggle />
              <ModeToggle />
            </div>

            {user && (
              <>
                <Separator orientation="vertical" className="h-8 mx-1 opacity-50 hidden sm:block" />
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <UserMenu />
                </motion.div>
              </>
            )}

            {!user && (
              <Link href="/auth">
                <Button size="sm" className="rounded-full px-6 font-black text-[11px] uppercase tracking-widest shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all">
                  {t("auth.login")}
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
