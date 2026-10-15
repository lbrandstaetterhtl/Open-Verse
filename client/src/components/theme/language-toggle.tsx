import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useTranslation } from "react-i18next";
import { Globe, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function LanguageToggle({ collapsed = false }: { collapsed?: boolean }) {
  const { i18n } = useTranslation();

  const loadLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem("i18nextLng", lang);
  };

  const currentLangName = {
    en: "English",
    de: "Deutsch",
    it: "Italiano",
    es: "Español",
    fr: "Français",
    zh: "中文",
  }[i18n.language.split('-')[0]] || "Language";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "w-full flex items-center rounded-sm h-10 transition-colors hover:bg-foreground/5 gap-3 px-3 sidebar-row",
            "text-muted-foreground hover:text-foreground",
            collapsed && "justify-center px-2"
          )}
          title="Switch language"
        >
          <Globe className="h-[18px] w-[18px] flex-shrink-0 stroke-2" />
          {!collapsed && (
            <>
              <span className="text-[13px] font-medium flex-1 text-left truncate sidebar-label">{currentLangName}</span>
              <ChevronRight className="h-3.5 w-3.5 opacity-50 sidebar-label" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-52 p-1.5">
        <div className="ov-label px-2 pt-1 pb-1.5">
          Select Language
        </div>
        <DropdownMenuItem className="h-8 px-2 text-[13px] font-medium" onClick={() => loadLanguage("en")}>English</DropdownMenuItem>
        <DropdownMenuItem className="h-8 px-2 text-[13px] font-medium" onClick={() => loadLanguage("de")}>Deutsch</DropdownMenuItem>
        <DropdownMenuItem className="h-8 px-2 text-[13px] font-medium" onClick={() => loadLanguage("it")}>Italiano</DropdownMenuItem>
        <DropdownMenuItem className="h-8 px-2 text-[13px] font-medium" onClick={() => loadLanguage("es")}>Español</DropdownMenuItem>
        <DropdownMenuItem className="h-8 px-2 text-[13px] font-medium" onClick={() => loadLanguage("fr")}>Français</DropdownMenuItem>
        <DropdownMenuItem className="h-8 px-2 text-[13px] font-medium" onClick={() => loadLanguage("zh")}>中文 (Mandarin)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
