import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Coffee, MessageSquare, Newspaper, UserCircle } from "lucide-react";
import { NotificationsDialog } from "@/components/notifications/notifications-dialog";
import { PreferencesDialog } from "@/components/preferences/preferences-dialog";

export function Navbar() {
  const [location] = useLocation();
  const { logoutMutation } = useAuth();

  const links = [
    { href: "/feed/media", icon: Newspaper, label: "Media Feed" },
    { href: "/feed/discussions", icon: MessageSquare, label: "Discussions Feed" },
    { href: "/profile", icon: UserCircle, label: "Profile" },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="container flex h-16 items-center px-4">
        <div className="mr-4 hidden md:flex">
          <Link href="/" className="flex items-center space-x-2">
            <Coffee className="h-6 w-6 text-primary" />
            <span className="font-bold">Pure Coffee</span>
          </Link>
        </div>

        <div className="flex items-center space-x-4 flex-1 justify-between">
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
            <PreferencesDialog />
            <NotificationsDialog />
            <Button
              variant="ghost"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              Logout
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}