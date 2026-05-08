/**
 * QuickThemeSwitcher — accessible within 2 clicks from anywhere in the app.
 * 1st click: opens popover
 * 2nd click: switches to Light / Dark / any saved custom theme
 *
 * Placed in the AppSidebar footer so it's always visible.
 */
import { useState } from "react";
import { Moon, Sun, Monitor, Palette, Check, ChevronRight } from "lucide-react";
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
  const { savedThemes, loadTheme, isDark } = useCustomTheme();
  const [open, setOpen] = useState(false);

  // Icon reflecting current state
  const CurrentIcon = isDark ? Moon : Sun;
  const label = theme === "dark" ? "Dark" : theme === "light" ? "Light" : "System";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "w-full flex items-center rounded-lg h-9 transition-all hover:bg-accent gap-3 px-3",
            "text-muted-foreground hover:text-foreground",
            collapsed && "justify-center px-2"
          )}
          title="Switch theme"
        >
          <CurrentIcon className="h-[18px] w-[18px] flex-shrink-0 stroke-2" />
          {!collapsed && (
            <>
              <span className="text-[13px] font-medium flex-1 text-left">{label} mode</span>
              <ChevronRight className="h-3.5 w-3.5 opacity-50" />
            </>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="right"
        align="end"
        sideOffset={8}
        className="w-52 p-1.5 bg-popover/90 backdrop-blur-xl border border-white/10 shadow-2xl"
      >
        {/* ── Light / Dark / System ── */}
        <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
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
              "w-full flex items-center gap-2.5 h-8 px-2 rounded-md transition-all text-[13px] font-medium",
              theme === value
                ? "bg-primary/10 text-primary"
                : "hover:bg-accent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="flex-1 text-left">{label}</span>
            {theme === value && <Check className="h-3 w-3" />}
          </button>
        ))}

        {/* ── Custom Saved Themes ── */}
        {savedThemes.length > 0 && (
          <>
            <div className="my-1.5 border-t border-border/40" />
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              My Themes
            </div>
            <div className="max-h-48 overflow-y-auto scrollbar-none space-y-0.5">
              {savedThemes.map((saved) => (
                <button
                  key={saved.id}
                  onClick={() => { loadTheme(saved); setOpen(false); }}
                  className="w-full flex items-center gap-2.5 h-8 px-2 rounded-md transition-all text-[13px] font-medium hover:bg-accent text-muted-foreground hover:text-foreground"
                >
                  {/* Color preview dot */}
                  <span
                    className="h-3 w-3 rounded-full border border-white/20 flex-shrink-0"
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
        <div className="my-1.5 border-t border-border/40" />
        <Link href="/theme-builder" onClick={() => setOpen(false)}>
          <button className="w-full flex items-center gap-2.5 h-8 px-2 rounded-md transition-all text-[13px] font-medium hover:bg-accent text-muted-foreground hover:text-foreground">
            <Palette className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Manage Themes</span>
          </button>
        </Link>
      </PopoverContent>
    </Popover>
  );
}
