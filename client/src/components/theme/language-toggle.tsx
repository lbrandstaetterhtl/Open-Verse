import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";

export function LanguageToggle() {
  const { i18n } = useTranslation();

  const loadLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem("i18nextLng", lang);
    // Reload to ensure all components pick up the change if needed,
    // although react-i18next usually handles this dynamically.
    // For now we trust dynamic update.
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <Globe className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all" />
          <span className="sr-only">Toggle language</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => loadLanguage("en")}>English</DropdownMenuItem>
        <DropdownMenuItem onClick={() => loadLanguage("de")}>Deutsch</DropdownMenuItem>
        <DropdownMenuItem onClick={() => loadLanguage("it")}>Italiano</DropdownMenuItem>
        <DropdownMenuItem onClick={() => loadLanguage("es")}>Español</DropdownMenuItem>
        <DropdownMenuItem onClick={() => loadLanguage("fr")}>Français</DropdownMenuItem>
        <DropdownMenuItem onClick={() => loadLanguage("zh")}>中文 (Mandarin)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
