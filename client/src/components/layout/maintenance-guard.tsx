import { useSiteSettings } from "@/hooks/use-site-settings";
import { useAuth } from "@/hooks/use-auth";
import { Hammer, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/* COMPONENT [AS-015]: Maintenance Guard – A full-screen overlay that blocks site access
   when maintenance mode is enabled, while providing a clear bypass for administrative staff. */

import { useLocation } from "wouter";

export function MaintenanceGuard({ children }: { children: React.ReactNode }) {
  const { settings } = useSiteSettings();
  const { user } = useAuth();
  const [location, navigate] = useLocation();

  const isAdmin = user && (user.isAdmin || user.role === "admin" || user.role === "owner");
  const isAuthPage = location === "/auth";
  const isMaintenance = settings.maintenance_mode && !isAdmin && !isAuthPage;

  if (isMaintenance) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-md p-6">
        <div className="max-w-md w-full text-center space-y-6 animate-in fade-in zoom-in duration-300">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-2">
            <Hammer className="h-10 w-10 text-primary animate-pulse" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">{settings.site_name}</h1>
            <p className="text-xl font-medium text-foreground/80">Under Maintenance</p>
          </div>

          <p className="text-muted-foreground leading-relaxed">
            We are currently performing scheduled maintenance to improve our services. 
            We'll be back online shortly. Thank you for your patience!
          </p>

          <Alert className="bg-primary/5 border-primary/20 text-left">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <AlertTitle className="text-sm font-semibold">Staff Member?</AlertTitle>
            <AlertDescription className="text-xs opacity-80">
              Administrative accounts have full access to the platform during maintenance. 
              Please log in to continue.
            </AlertDescription>
          </Alert>

          <div className="pt-4">
            <Button variant="outline" onClick={() => navigate("/auth")}>
              Staff Login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
