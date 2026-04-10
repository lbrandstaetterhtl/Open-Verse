import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  MessageSquare,
  Newspaper,
  UserCircle,
  MessageCircle,
  Shield,
  Palette,
  Bot,
  ShieldAlert,
  Users,
  Menu,
  AlertCircle,
  Ticket,
} from "lucide-react";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ModeToggle } from "@/components/theme/mode-toggle";
import { LanguageToggle } from "@/components/theme/language-toggle";
import { OpenVerseIcon } from "@/components/icons/open-verse-icon";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from "@/components/ui/sheet";
import { useQuery } from "@tanstack/react-query";
import { Community } from "@shared/schema";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useSiteSettings } from "@/hooks/use-site-settings";

/* REDESIGN [UX-001]: Restructured navbar into grouped sections with visual separators.
   Primary links (feeds) are prominent, secondary tools are compact, utility actions are right-aligned. */

export function Navbar() {
  const { t } = useTranslation();
  const [location] = useLocation();
  const { logoutMutation, user } = useAuth();
  const { settings } = useSiteSettings();

  const { data: moderatedCommunities } = useQuery<Community[]>({
    queryKey: ["/api/user/moderated-communities"],
    enabled: !!user,
  });

  const isModerator = moderatedCommunities && moderatedCommunities.length > 0;

  /* REDESIGN [UX-001]: Split links into primary (content feeds) and secondary (tools/admin) */
  const primaryLinks = [
    { href: "/feed/media", icon: Newspaper, label: t("navbar.media_feed") },
    { href: "/feed/discussions", icon: MessageSquare, label: t("navbar.discussions_feed") },
    { href: "/feed/communities", icon: Users, label: t("navbar.communities") },
  ];

  const secondaryLinks = [
    { href: "/ai-generator", icon: Bot, label: t("navbar.ai_generator") },
    { href: "/tickets", icon: AlertCircle, label: t("navbar.support", "Support Tickets") },
    { href: "/chat", icon: MessageCircle, label: t("navbar.messages") },
    { href: "/profile", icon: UserCircle, label: t("navbar.profile") },
    { href: "/theme-builder", icon: Palette, label: t("navbar.theme_builder") },
    ...(isModerator
      ? [{ href: "/mod-panel", icon: ShieldAlert, label: t("navbar.mod_panel") }]
      : []),
    ...(user?.isAdmin || user?.role === "admin" || user?.role === "owner"
      ? [{ href: "/admin", icon: Shield, label: t("navbar.admin") }, { href: "/admin/tickets", icon: Ticket, label: t("navbar.manage_tickets", "Manage Tickets") }]
      : []),
  ];

  const allLinks = [...primaryLinks, ...secondaryLinks];

  return (
    /* REDESIGN [UX-001]: Reduced nav height from h-16 to h-14 for less visual weight */
    <nav className="fixed top-0 left-0 right-0 border-b bg-background/95 backdrop-blur-sm shadow-sm z-[100]">
      <div className="w-full flex h-14 items-center px-4 relative z-[100]">
        {/* Brand Section (Left) */}
        <div className="flex items-center flex-shrink-0">
          <div className="md:hidden mr-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open Menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px]">
                <SheetHeader>
                  <SheetTitle className="text-left font-bold">{settings.site_name}</SheetTitle>
                </SheetHeader>
                  <div className="space-y-4">
                    <div>
                      <span className="text-xs font-semibold text-muted-foreground px-3 mb-2 uppercase tracking-tight block opacity-70">
                        {t("navbar.content_feeds")}
                      </span>
                      <div className="space-y-1">
                        {primaryLinks.map((link) => (
                          <Link key={link.href} href={link.href}>
                            <Button
                              variant={location === link.href ? "secondary" : "ghost"}
                              className={cn(
                                "w-full justify-start space-x-3 h-11 px-3 rounded-lg",
                                location === link.href && "bg-primary/10 text-primary"
                              )}
                            >
                              <link.icon className="h-5 w-5 opacity-80" />
                              <span className="text-sm font-medium">{link.label}</span>
                            </Button>
                          </Link>
                        ))}
                      </div>
                    </div>

                    <Separator className="opacity-50" />

                    <div>
                      <span className="text-xs font-semibold text-muted-foreground px-3 mb-2 uppercase tracking-tight block opacity-70">
                        {t("navbar.personal_tools")}
                      </span>
                      <div className="space-y-1">
                        {secondaryLinks.map((link) => (
                          <Link key={link.href} href={link.href}>
                            <Button
                              variant={location === link.href ? "secondary" : "ghost"}
                              className={cn(
                                "w-full justify-start space-x-3 h-11 px-3 rounded-lg",
                                location === link.href && "bg-primary/10 text-primary"
                              )}
                            >
                              <link.icon className="h-5 w-5 opacity-80" />
                              <span className="text-sm font-medium">{link.label}</span>
                            </Button>
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
              </SheetContent>
            </Sheet>
          </div>

          <Link href="/" className="flex items-center space-x-2">
            <OpenVerseIcon className="h-8 w-auto object-contain text-primary" />
            <span className="font-bold hidden sm:inline text-sm tracking-tight">{settings.site_name}</span>
          </Link>
        </div>

        {/* REDESIGN [UX-001]: Centered Desktop Links */}
        <div className="hidden md:flex flex-1 items-center justify-center px-4 min-w-0 overflow-x-auto no-scrollbar">
          <div className="flex items-center space-x-1 flex-shrink-0">
            {primaryLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                <Button
                  variant={location === link.href ? "secondary" : "ghost"}
                  size="sm"
                  className={cn(
                    "flex items-center space-x-1.5 transition-all duration-200 flex-shrink-0",
                    location === link.href && "bg-primary/10 text-primary hover:bg-primary/20"
                  )}
                >
                  <link.icon className="h-4 w-4" />
                  <span className="hidden lg:inline text-xs font-medium">{link.label}</span>
                </Button>
              </Link>
            ))}
          </div>

          <Separator orientation="vertical" className="h-6 mx-2 flex-shrink-0" />

          <div className="flex items-center space-x-1 flex-shrink-0">
            {secondaryLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                <Button
                  variant={location === link.href ? "secondary" : "ghost"}
                  size="sm"
                  className={cn(
                    "flex items-center space-x-1.5 transition-all duration-200 flex-shrink-0 px-2 lg:px-3",
                    location === link.href && "bg-primary/10 text-primary hover:bg-primary/20"
                  )}
                >
                  <link.icon className="h-4 w-4" />
                  <span className="hidden xl:inline text-xs font-medium">{link.label}</span>
                </Button>
              </Link>
            ))}
          </div>
        </div>

        {/* Utility actions (Right) */}
        <div className="flex items-center space-x-1 justify-end flex-shrink-0 ml-auto">
          <NotificationBell />
          <LanguageToggle />
          <ModeToggle />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            className="hidden sm:inline-flex"
          >
            <span className="text-xs font-medium">{t("navbar.logout")}</span>
          </Button>
        </div>
      </div>
    </nav>
  );
}
