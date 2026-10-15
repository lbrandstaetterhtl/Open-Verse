/**
 * QuickThemeSwitcher — accessible within 2 clicks from anywhere in the app.
 * 1st click: opens popover
 * 2nd click: switches to Light / Dark / any saved custom theme
 *
 * Placed in the AppSidebar footer so it's always visible.
 */
import { useState } from "react";
import { Moon, Sun, Monitor, Palette, Check, ChevronRight, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/components/theme/theme-provider";
import { useCustomTheme } from "@/hooks/use-custom-theme";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Link } from "wouter";

interface QuickThemeSwitcherProps {
  collapsed?: boolean;
}

export function QuickThemeSwitcher({ collapsed = false }: QuickThemeSwitcherProps) {
  const { theme, setTheme } = useTheme();
  const { savedThemes, loadTheme, isDark, isStandard, resetTheme } = useCustomTheme();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  // Icon reflecting current state
  const CurrentIcon = isDark ? Moon : Sun;
  const label = theme === "dark" ? "Dark" : theme === "light" ? "Light" : "System";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "w-full flex items-center rounded-sm h-10 transition-colors hover:bg-foreground/5 gap-3 px-3 sidebar-row",
            "text-muted-foreground hover:text-foreground",
            collapsed && "justify-center px-2"
          )}
          title="Switch theme"
        >
          <CurrentIcon className="h-[18px] w-[18px] flex-shrink-0 stroke-2" />
          {!collapsed && (
            <>
              <span className="text-[13px] font-medium flex-1 text-left truncate sidebar-label">{label} mode</span>
              <ChevronRight className="h-3.5 w-3.5 opacity-50 sidebar-label" />
            </>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="right"
        align="end"
        sideOffset={8}
        className="w-52 p-1.5"
      >
        {/* ── Light / Dark / System ── */}
        <div className="ov-label px-2 pt-1 pb-1.5">
          Mode
        </div>

        {(
          [
            { value: "light", label: "Light", icon: Sun },
            { value: "dark", label: "Dark", icon: Moon },
            { value: "system", label: "System", icon: Monitor },
          ] as const
        ).map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => { setTheme(value); setOpen(false); }}
            className={cn(
              "w-full flex items-center gap-2.5 h-8 px-2 rounded-sm transition-colors text-[13px] font-medium",
              theme === value
                ? "ov-nav-active ov-cut"
                : "hover:bg-foreground/5 text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="flex-1 text-left">{label}</span>
            {theme === value && <Check className="h-3 w-3" />}
          </button>
        ))}

        {/* ── Standard design and saved themes ── */}
        <div className="my-1.5 border-t border-border" />
        <div className="ov-label px-2 pt-1 pb-1.5">
          {t("theme_builder.design_label", "Design")}
        </div>
        <button
          onClick={() => { resetTheme(); setOpen(false); }}
          aria-pressed={isStandard}
          className={cn(
            "w-full flex items-center gap-2.5 h-8 px-2 rounded-sm transition-colors text-[13px] font-medium hover:bg-foreground/5",
            isStandard ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Lock className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="flex-1 text-left">{t("theme_builder.standard_name", "Standard")}</span>
          {isStandard && <Check className="h-3 w-3" />}
        </button>
        {savedThemes.length > 0 && (
          <>
            <div className="max-h-48 overflow-y-auto scrollbar-none space-y-0.5">
              {savedThemes.map((saved) => (
                <button
                  key={saved.id}
                  onClick={() => { loadTheme(saved); setOpen(false); }}
                  className="w-full flex items-center gap-2.5 h-8 px-2 rounded-sm transition-colors text-[13px] font-medium hover:bg-foreground/5 text-muted-foreground hover:text-foreground"
                >
                  {/* Color preview dot */}
                  <span
                    className="h-3 w-3 rounded-full border border-border flex-shrink-0"
                    style={{
                      background: `hsl(${isDark ? saved.colors.dark.primary : saved.colors.light.primary})`,
                    }}
                  />
                  <span className="flex-1 text-left truncate">{saved.name}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Theme Builder Link ── */}
        <div className="my-1.5 border-t border-border" />
        <Link href="/theme-builder" onClick={() => setOpen(false)}>
          <button className="w-full flex items-center gap-2.5 h-8 px-2 rounded-sm transition-colors text-[13px] font-medium hover:bg-foreground/5 text-muted-foreground hover:text-foreground">
            <Palette className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Manage Themes</span>
          </button>
        </Link>
      </PopoverContent>
    </Popover>
  );
}
