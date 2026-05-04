import { useSiteSettings } from "@/hooks/use-site-settings";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";

/* COMPONENT [UI-005]: Global Footer – A clean, minimal footer that integrates
   custom branding and copyright information from the Admin Settings. */

export function Footer() {
  const { settings } = useSiteSettings();
  const { t } = useTranslation();

  return (
    <footer className="w-full border-t bg-background/50 pt-8 pb-24 md:pb-8 px-4 mt-auto">
      <div className="container mx-auto max-w-7xl">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col items-center md:items-start space-y-2">
            <span className="text-xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              {settings.site_name}
            </span>
            <p className="text-sm text-muted-foreground/80 max-w-xs text-center md:text-left">
              {settings.site_description || t("footer.default_tagline")}
            </p>
          </div>

          <div className="flex items-center space-x-6 text-sm text-muted-foreground font-medium">
            <Link href="/privacy" className="hover:text-primary transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-primary transition-colors">Terms</Link>
            <Link href="/contact" className="hover:text-primary transition-colors">Contact</Link>
          </div>

          <div className="text-xs text-muted-foreground/60 text-center md:text-right">
            <p>{settings.custom_footer_text || `© ${new Date().getFullYear()} ${settings.site_name}. All rights reserved.`}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
