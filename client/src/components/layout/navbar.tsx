import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { MessageSquare, Newspaper, UserCircle, MessageCircle, Shield, Palette, Bot, ShieldAlert, Users } from "lucide-react";
import { NotificationsDialog } from "@/components/notifications/notifications-dialog";
import { ModeToggle } from "@/components/theme/mode-toggle";
import { LanguageToggle } from "@/components/theme/language-toggle";
import { OpenVerseIcon } from "@/components/icons/open-verse-icon";
import { useQuery } from "@tanstack/react-query";
import { Community } from "@shared/schema";

export function Navbar() {
  const { t } = useTranslation();
  const [location] = useLocation();
  const { logoutMutation, user } = useAuth();

  const { data: moderatedCommunities } = useQuery<Community[]>({
    queryKey: ["/api/user/moderated-communities"],
    enabled: !!user,
  });

  const isModerator = moderatedCommunities && moderatedCommunities.length > 0;

  const links = [
    { href: "/feed/media", icon: Newspaper, label: t('navbar.media_feed') },
    { href: "/feed/discussions", icon: MessageSquare, label: t('navbar.discussions_feed') },
    { href: "/feed/communities", icon: Users, label: "Communities" }, // New feed
    { href: "/ai-generator", icon: Bot, label: "AI Generator" },
    { href: "/chat", icon: MessageCircle, label: t('navbar.messages') },
    { href: "/profile", icon: UserCircle, label: t('navbar.profile') },
    { href: "/theme-builder", icon: Palette, label: t('navbar.theme_builder') },
    ...(isModerator ? [
      { href: "/mod-panel", icon: ShieldAlert, label: "Mod Panel" }
    ] : []),
    // Show admin link for users with admin privileges
    ...(user?.isAdmin || user?.role === 'admin' || user?.role === 'owner' ? [
      { href: "/admin", icon: Shield, label: t('navbar.admin') }
    ] : []),
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 border-b bg-background shadow-md z-[100]">
      <div className="w-full flex h-16 items-center px-2 relative z-[100]">
        <div className="mr-4 hidden md:flex">
          <Link href="/" className="flex items-center space-x-2">
            <OpenVerseIcon className="h-20 w-auto object-contain text-primary" />
            <span className="font-bold">{t('navbar.brand')}</span>
          </Link>
        </div>

        <div className="flex items-center space-x-4 flex-1 justify-end">
          <div className="flex items-center space-x-4">
            {links.map((link) => (
              <Link key={link.href} href={link.href}>
                <Button
                  variant={location === link.href ? "default" : "ghost"}
                  className="flex items-center space-x-2"
                >
                  <link.icon className="h-4 w-4" />
                  <span className="hidden md:inline">{link.label}</span>
                </Button>
              </Link>
            ))}
          </div>

          <div className="flex items-center space-x-2">
            <NotificationsDialog />
            <LanguageToggle />
            <ModeToggle />
            <Button
              variant="ghost"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              {t('navbar.logout')}
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}