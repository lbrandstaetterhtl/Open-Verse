import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/theme/theme-provider";
import { useCustomTheme } from "@/hooks/use-custom-theme";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Palette, Settings } from "lucide-react";

export function ModeToggle() {
  const { setTheme } = useTheme();
  const { savedThemes, loadTheme } = useCustomTheme();
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Mode</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setTheme("light")}>
          {t("common.theme.light")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          {t("common.theme.dark")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          {t("common.theme.system")}
        </DropdownMenuItem>

        {savedThemes.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Saved Themes</DropdownMenuLabel>
            {savedThemes.map((theme) => (
              <DropdownMenuItem key={theme.id} onClick={() => loadTheme(theme)}>
                <span
                  className="mr-2 h-2 w-2 rounded-full border"
                  style={{ background: `hsl(${theme.colors.light.primary})` }}
                />
                {theme.name}
              </DropdownMenuItem>
            ))}
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setLocation("/theme-builder")}>
          <Palette className="mr-2 h-4 w-4" />
          <span>Manage Themes</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
