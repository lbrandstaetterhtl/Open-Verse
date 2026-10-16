import { useState, useEffect, useRef } from "react";
import { useTranslation, Trans } from "react-i18next";
import { useLocation } from "wouter";
import { useCustomTheme } from "@/hooks/use-custom-theme";
import { ThemeGroup } from "@/components/theme/theme-group";
import { ThemeBackground } from "@/components/theme/theme-background";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Palette,
  Type,
  Square,
  MousePointer,
  Download,
  Upload,
  RotateCcw,
  Save,
  Plus,
  Image,
  Layers,
  History,
  Monitor,
  Smartphone,
  Info,
  Shuffle,
  Sparkles,
  Sun,
  Contrast as ContrastIcon,
  Hexagon,
  PanelTop,
  Orbit,
  Users,
  FileText,
  Heart,
  MessageCircle,
  BadgeCheck,
  Lock,
} from "lucide-react";
import {
  exportTheme,
  importTheme,
  loadCustomTheme,
  defaultTheme,
  applyTheme,
  getActiveThemeInfo,
  setActiveThemeInfo,
  clearActiveThemeInfo,
  ACTIVE_THEME_EVENT,
  availableFonts,
  dataFonts,
  generateRandomTheme,
  normalizeShape,
  normalizeSurface,
  normalizeFonts,
  normalizeGalaxy,
} from "@/lib/theme-utils";
import { useToast } from "@/hooks/use-toast";
import type {
  ThemeColors,
  CustomTheme,
  BackgroundMode,
  ParticleConfig,
  ShapeConfig,
  ShapeStyle,
  AvatarShape,
  SurfaceConfig,
  SurfaceMode,
  FontConfig,
  GalaxyConfig,
} from "@/lib/theme-utils";
import { galaxyGradients, defaultBackground, defaultParticles, applyParticleConfig, CONSTELLATION_NAMES, setThemePreviewActive, applyColorScheme, applyStoredTheme } from "@/lib/theme-utils";
import { StarChart, STAR_CHARTS } from "@/components/layout/star-chart";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/user-avatar";

/* THEME-REDESIGN [TB-003]: Human-readable metadata for theme tokens */
const COLOR_METADATA: Record<keyof ThemeColors, { label: string; description: string; contrastAgainst?: keyof ThemeColors }> = {
  background: { label: "Page Background", description: "Main color behind all content" },
  foreground: { label: "Main Text", description: "Standard text color", contrastAgainst: "background" },
  card: { label: "Card Color", description: "Background of posts and panels" },
  cardForeground: { label: "Card Text", description: "Text color inside cards", contrastAgainst: "card" },
  popover: { label: "Menu Background", description: "Dropdown menus and tooltips" },
  popoverForeground: { label: "Menu Text", description: "Text inside menus", contrastAgainst: "popover" },
  primary: { label: "Primary Brand Color", description: "Main buttons and active states" },
  primaryForeground: { label: "Primary Button Text", description: "Text on brand-colored buttons", contrastAgainst: "primary" },
  secondary: { label: "Subtle Action Color", description: "Secondary buttons and backgrounds" },
  secondaryForeground: { label: "Subtle Action Text", description: "Text on secondary elements", contrastAgainst: "secondary" },
  muted: { label: "Ghost Background", description: "Very subtle backgrounds and borders" },
  mutedForeground: { label: "Subtle Text", description: "Secondary or less important text", contrastAgainst: "background" },
  accent: { label: "Highlight Color", description: "Hover states and active highlights" },
  accentForeground: { label: "Highlight Text", description: "Text on highlight backgrounds", contrastAgainst: "accent" },
  destructive: { label: "Danger Color", description: "Delete buttons and error states" },
  destructiveForeground: { label: "Danger Text", description: "Text on danger buttons", contrastAgainst: "destructive" },
  border: { label: "Border Color", description: "Lines between layout sections" },
  input: { label: "Input Border", description: "Borders of text and select fields" },
  ring: { label: "Focus Outline", description: "Ring visible when an element is focused" },
  star: { label: "Starlight", description: "Warm highlight for badges, markers and single stars", contrastAgainst: "card" },
};

/* Translation key of a colour token: "theme_builder.colors.card_foreground" for "cardForeground". The English
   label and description above are the defaults. */
const colorKey = (token: string) => `theme_builder.colors.${token.replaceAll(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}`;

/* Segmented control for small option sets; the selected option carries aria-pressed. */
function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  labelledBy,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  labelledBy?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      className="flex w-full gap-0.5 rounded-pill border border-border bg-background/40 p-1"
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded-pill px-2 py-1.5 text-xs transition-colors ${
              selected ? "ov-tab-active font-semibold" : "font-medium text-muted-foreground hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* Labelled slider with its current value shown in the data font. */
function RangeSetting({
  label,
  valueLabel,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
  onCommit,
}: {
  label: string;
  valueLabel: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  return (
    <div className={`space-y-3 ${disabled ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <Label className="text-xs font-semibold">{label}</Label>
        <span className="ov-data text-xs text-muted-foreground">{valueLabel}</span>
      </div>
      <Slider
        aria-label={label}
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={([next]) => onChange(next)}
        onValueCommit={([next]) => onCommit(next)}
      />
    </div>
  );
}

/* Labelled on/off switch. */
function ToggleSetting({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="text-xs font-medium">{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/* Keeps a font that is not in the list (e.g. from an imported theme) selectable. */
function withCurrentFont(list: { name: string; family: string }[], current: string) {
  return list.some((font) => font.name === current) ? list : [{ name: current, family: current }, ...list];
}

export default function ThemeBuilderPage() {
  const { t } = useTranslation();
  const [, _setLocation] = useLocation();
  const {
    customTheme,
    isStandard,
    isDark: _isDark,
    updateColor: _updateColor,
    resetTheme,
    importTheme: importCustomTheme,
    savedThemes,
    saveThemeAs,
    deleteTheme: _deleteTheme,
    loadTheme,
    uploadBackground,
  } = useCustomTheme();
  const { toast } = useToast();
  
  // Start the preview in the mode the app is in, so the page never mixes light colours with dark mode.
  const [activeMode, setActiveMode] = useState<"light" | "dark">(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );
  // Follow the app's light/dark switch (it can be applied after this page mounts).
  useEffect(() => {
    setActiveMode(_isDark ? "dark" : "light");
  }, [_isDark]);
  const [workingTheme, setWorkingTheme] = useState<CustomTheme>(customTheme);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  // The standard design is fixed. Editing always starts from a copy ("New" or "Import").
  const [editingCopy, setEditingCopy] = useState(false);
  const locked = isStandard && !editingCopy;
  const [themeName, setThemeName] = useState(() => t("theme_builder.default_theme_name", "My custom theme"));
  const [activeThemeId, setActiveThemeId] = useState<string | number | null>(null);
  const [unifiedMode, setUnifiedMode] = useState(false);
  const [bgUploading, setBgUploading] = useState(false);
  const [previewSize, setPreviewSize] = useState<"desktop" | "mobile">("desktop");
  const [mobileActiveTab, setMobileActiveTab] = useState<"settings" | "preview">("settings");

  if (!workingTheme) return null;

  /* THEME-REDESIGN [TB-006]: Undo/Redo System */
  const history = useRef<CustomTheme[]>([]);
  const historyIndex = useRef(-1);

  const pushToHistory = (theme: CustomTheme) => {
    // Basic history management
    const currentThemeJson = JSON.stringify(theme);
    if (historyIndex.current >= 0 && JSON.stringify(history.current[historyIndex.current]) === currentThemeJson) {
      return;
    }
    
    const newHistory = history.current.slice(0, historyIndex.current + 1);
    newHistory.push(JSON.parse(currentThemeJson));
    if (newHistory.length > 50) newHistory.shift();
    
    history.current = newHistory;
    historyIndex.current = newHistory.length - 1;
  };

  const undo = () => {
    if (historyIndex.current > 0) {
      historyIndex.current--;
      const prev = history.current[historyIndex.current];
      setWorkingTheme(JSON.parse(JSON.stringify(prev)));
      setHasUnsavedChanges(true);
    }
  };

  const redo = () => {
    if (historyIndex.current < history.current.length - 1) {
      historyIndex.current++;
      const next = history.current[historyIndex.current];
      setWorkingTheme(JSON.parse(JSON.stringify(next)));
      setHasUnsavedChanges(true);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (locked) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        redo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [workingTheme, themeName, activeThemeId, locked]);

  /* THEME-REDESIGN [TB-005]: Unsaved changes guard */
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Initial load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isNew = params.get("new") === "true";
    
    if (isNew) {
      handleCreateNew();
    } else {
      const stored = loadCustomTheme();
      const initialTheme = stored || defaultTheme;
      setWorkingTheme(initialTheme);
      setUnifiedMode(!!initialTheme.unified);
      
      const activeInfo = getActiveThemeInfo();
      if (activeInfo) {
        setThemeName(activeInfo.name);
        setActiveThemeId(activeInfo.id);
      }

      pushToHistory(initialTheme);
    }
  }, []);

  // Sync with theme store changes
  useEffect(() => {
    const handleActiveThemeChange = () => {
      const activeInfo = getActiveThemeInfo();
      if (activeInfo) {
        setThemeName(activeInfo.name);
        setActiveThemeId(activeInfo.id);
        const stored = loadCustomTheme();
        if (stored) {
          setWorkingTheme(stored);
          pushToHistory(stored);
        }
        setHasUnsavedChanges(false);
      }
    };
    window.addEventListener(ACTIVE_THEME_EVENT, handleActiveThemeChange);
    return () => window.removeEventListener(ACTIVE_THEME_EVENT, handleActiveThemeChange);
  }, []);

  // While the builder is open its preview wins; on leaving, the stored theme and the chosen light/dark
  // mode come back (the preview switches the .dark class and the colours).
  useEffect(() => {
    setThemePreviewActive(true);
    return () => {
      setThemePreviewActive(false);
      window.dispatchEvent(new CustomEvent("open-verse-preview-bg", { detail: null }));
      applyColorScheme();
      applyStoredTheme();
    };
  }, []);

  // Live Preview Sync - [FIX: Follow activeMode instead of global isDark]
  useEffect(() => {
    // Apply the colors from the tab the user is currently editing
    const isDarkMode = activeMode === "dark";
    applyTheme(workingTheme[activeMode], isDarkMode, workingTheme.font, locked ? undefined : workingTheme.background, workingTheme);
    
    // Toggle the .dark class on the root to ensure shadcn components respond correctly
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    
    window.dispatchEvent(new CustomEvent("open-verse-preview-bg", { 
      detail: locked ? null : workingTheme.background ?? null
    }));
    
    // Cleanup: restore global theme when leaving component
    return () => {
      // Cleanup: ThemeProvider will take over on next render.
      // This is a bit tricky since we don't want to break the app's dark mode setting,
      // but the ThemeProvider will usually take over on next render or mount.
    };
  }, [workingTheme, activeMode, locked]);

  const handleColorChange = (key: keyof ThemeColors, value: string) => {
    setWorkingTheme((prev) => {
      const updated = unifiedMode 
        ? { ...prev, light: { ...prev.light, [key]: value }, dark: { ...prev.dark, [key]: value } }
        : { ...prev, [activeMode]: { ...prev[activeMode], [key]: value } };
      
      pushToHistory(updated);
      return updated;
    });
    setHasUnsavedChanges(true);
  };
  const handleFontChange = (role: keyof FontConfig, value: string) => {
    setWorkingTheme((prev) => {
      const current = normalizeFonts(prev.fonts, prev.fonts ? undefined : prev.font);
      const nextFonts: FontConfig = { ...current, [role]: value };
      // "Same as text" keeps following the body font.
      if (role === "body" && current.data === current.body) nextFonts.data = value;
      // `font` mirrors the body font for themes and clients that only know the single font.
      const updated = { ...prev, fonts: nextFonts, font: nextFonts.body };
      pushToHistory(updated);
      return updated;
    });
    setHasUnsavedChanges(true);
  };

  // Shape, surface and galaxy settings. `record` is false while a slider is being dragged;
  // the slider's commit then applies and records the committed value (record = true).
  const updateDesign = (patch: (prev: CustomTheme) => Partial<CustomTheme>, record = true) => {
    setWorkingTheme((prev) => {
      const updated = { ...prev, ...patch(prev) };
      if (record) pushToHistory(updated);
      return updated;
    });
    setHasUnsavedChanges(true);
  };

  const handleShapeChange = (patch: Partial<ShapeConfig>, record = true) =>
    updateDesign((prev) => ({ shape: { ...normalizeShape(prev.shape), ...patch } }), record);

  const handleSurfaceChange = (patch: Partial<SurfaceConfig>, record = true) =>
    updateDesign((prev) => ({ surface: { ...normalizeSurface(prev.surface), ...patch } }), record);

  const handleGalaxyChange = (patch: Partial<GalaxyConfig>, record = true) =>
    updateDesign((prev) => ({ galaxy: { ...normalizeGalaxy(prev.galaxy), ...patch } }), record);

  const handleShuffle = () => {
    const generated = generateRandomTheme();
    // Only the palette and background gradient change; shape, surface, fonts, galaxy and particles stay.
    setWorkingTheme((prev) => {
      const previousBackground = prev.background ?? defaultBackground;
      const updated: CustomTheme = {
        ...prev,
        light: unifiedMode ? generated[activeMode] : generated.light,
        dark: unifiedMode ? generated[activeMode] : generated.dark,
        background: {
          ...previousBackground,
          ...generated.background,
          overlay: { ...previousBackground.overlay, ...generated.background?.overlay },
        },
      };
      pushToHistory(updated);
      return updated;
    });
    setHasUnsavedChanges(true);
    toast({
      title: t("theme_builder.shuffled_title", "Theme shuffled"),
      description: t("theme_builder.shuffled_desc", "A new harmonious palette has been generated."),
    });
  };

  const handleHarmonize = () => {
    // Take the current primary color and generate matching colors for everything else
    const primaryHsl = workingTheme[activeMode].primary;
    const parts = primaryHsl.split(" ");
    if (parts.length < 3) return;
    const h = parts[0];
    
    setWorkingTheme(prev => {
      const updated = { ...prev };
      const mode = activeMode;
      const isDark = mode === "dark";
      
      updated[mode] = {
        ...prev[mode],
        background: isDark ? `${h} 40% 6%` : `${h} 20% 98%`,
        card: isDark ? `${h} 30% 10%` : "0 0% 100%",
        secondary: isDark ? `${h} 20% 15%` : `${h} 20% 95%`,
        muted: isDark ? `${h} 20% 15%` : `${h} 15% 96%`,
        accent: isDark ? `${h} 40% 20%` : `${h} 30% 94%`,
        border: isDark ? `${h} 20% 18%` : `${h} 20% 90%`,
        input: isDark ? `${h} 20% 15%` : `${h} 20% 92%`,
        ring: primaryHsl,
      };

      if (unifiedMode) {
        updated[isDark ? "light" : "dark"] = { ...updated[mode] };
      }

      pushToHistory(updated);
      return updated;
    });
    setHasUnsavedChanges(true);
    toast({
      title: t("theme_builder.harmonized_title", "Theme harmonized"),
      description: t("theme_builder.harmonized_desc", "Colors have been adjusted to match your primary color."),
    });
  };

  const handleSave = async () => {
    try {
      importCustomTheme(workingTheme);
      const saved = await saveThemeAs(themeName, activeThemeId || undefined, workingTheme);
      setActiveThemeId(saved.id);
      setActiveThemeInfo(saved.id, saved.name);
      setHasUnsavedChanges(false);
      toast({
        title: t("theme.saved", "Theme saved"),
        description: t("theme.saved_desc", { name: themeName, defaultValue: "\"{{name}}\" has been saved." }),
      });
    } catch {
      toast({ title: t("theme.save_failed", "The theme could not be saved"), variant: "destructive" });
    }
  };

  const handleCreateNew = () => {
    setEditingCopy(true);
    setThemeName(t("theme_builder.new_theme_name", "My theme"));
    setActiveThemeId(null);
    clearActiveThemeInfo();
    setWorkingTheme(defaultTheme);
    setUnifiedMode(false);
    setHasUnsavedChanges(true);
    pushToHistory(defaultTheme);
  };

  /** Switch back to the fixed standard design and lock the editor again. */
  const handleUseStandard = () => {
    resetTheme();
    setEditingCopy(false);
    setActiveThemeId(null);
    setThemeName(t("theme_builder.standard_name", "Standard"));
    setWorkingTheme(defaultTheme);
    setHasUnsavedChanges(false);
    pushToHistory(defaultTheme);
  };

  const handleExport = () => {
    const json = exportTheme(workingTheme);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${themeName.toLowerCase().replaceAll(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const theme = importTheme(event.target?.result as string);
        if (theme) {
          setEditingCopy(true);
          setWorkingTheme(theme);
          setHasUnsavedChanges(true);
          pushToHistory(theme);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleBgModeChange = (mode: BackgroundMode) => {
    const updated = { ...workingTheme, background: { ...workingTheme.background || defaultBackground, mode } };
    setWorkingTheme(updated);
    setHasUnsavedChanges(true);
    pushToHistory(updated);
  };

  const handleBgImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBgUploading(true);
    try {
      const imageRef = await uploadBackground(file);
      const updated = { ...workingTheme, background: { ...workingTheme.background || defaultBackground, mode: "image" as const, image: imageRef } };
      setWorkingTheme(updated);
      setHasUnsavedChanges(true);
      pushToHistory(updated);
    } catch {
      toast({ title: t("theme_builder.upload_failed", "Upload failed"), variant: "destructive" });
    } finally {
      setBgUploading(false);
    }
  };

  const descriptions = Object.fromEntries(
    Object.entries(COLOR_METADATA).map(([key, meta]) => [key, t(`${colorKey(key)}.description`, meta.description)])
  ) as Partial<Record<keyof ThemeColors, string>>;

  const contrastPairs = Object.fromEntries(
    Object.entries(COLOR_METADATA)
      .filter(([, meta]) => meta.contrastAgainst)
      .map(([key, meta]) => [key, meta.contrastAgainst])
  ) as Partial<Record<keyof ThemeColors, keyof ThemeColors>>;

  const currentColors = workingTheme[activeMode];
  const defaultColors = defaultTheme[activeMode];

  const shape = normalizeShape(workingTheme.shape);
  const surface = normalizeSurface(workingTheme.surface);
  // Glass always blurs by at least 12px (see applyDesign), so the slider shows and offers that range.
  const minBlur = surface.mode === "glas" ? 12 : 0;
  const effectiveBlur = Math.max(surface.blur, minBlur);
  const fonts =normalizeFonts(workingTheme.fonts, workingTheme.fonts ? undefined : workingTheme.font);
  const galaxy = normalizeGalaxy(workingTheme.galaxy);

  const colorLabels: Partial<Record<keyof ThemeColors, string>> = {
    ...(Object.fromEntries(
      Object.entries(COLOR_METADATA).map(([key, meta]) => [key, t(`${colorKey(key)}.label`, meta.label)])
    ) as Partial<Record<keyof ThemeColors, string>>),
    star: t("theme_builder.color_star", "Starlight"),
  };

  const backgroundModeLabels: Record<BackgroundMode, string> = {
    solid: t("theme_builder.bg_mode_solid", "Solid"),
    gradient: t("theme_builder.bg_mode_gradient", "Gradient"),
    image: t("theme_builder.bg_mode_image", "Image"),
  };
  const backgroundModeOptions: { value: BackgroundMode; label: string }[] = (["solid", "gradient", "image"] as const).map((mode) => ({
    value: mode,
    label: backgroundModeLabels[mode],
  }));

  const cornerStyleOptions: { value: ShapeStyle; label: string }[] = [
    { value: "fase", label: t("theme_builder.corner_fase", "Chamfer") },
    { value: "kante", label: t("theme_builder.corner_kante", "Sharp") },
    { value: "rund", label: t("theme_builder.corner_rund", "Round") },
  ];

  const avatarShapeOptions: { value: AvatarShape; label: string }[] = [
    { value: "achteck", label: t("theme_builder.avatar_achteck", "Octagon") },
    { value: "quadrat", label: t("theme_builder.avatar_quadrat", "Square") },
    { value: "kreis", label: t("theme_builder.avatar_kreis", "Circle") },
  ];

  const surfaceModeOptions: { value: SurfaceMode; label: string }[] = [
    { value: "panel", label: t("theme_builder.surface_panel", "Panel") },
    { value: "glas", label: t("theme_builder.surface_glas", "Glass") },
    { value: "kontur", label: t("theme_builder.surface_kontur", "Outline") },
  ];

  // "Same as text" uses the body font, so the list leaves that font out to avoid two items with one value.
  const dataFontOptions = dataFonts.filter((font) => font.name !== fonts.body);
  const hasUnlistedDataFont = fonts.data !== fonts.body && !dataFonts.some((font) => font.name === fonts.data);

  return (
    <div className="flex flex-col min-h-screen bg-transparent">
      {/* THEME-REDESIGN [TB-011]: Use normal Navbar */}
      
      <main className="flex-1 flex flex-col lg:flex-row h-[calc(100vh-3.5rem)] mt-14 overflow-hidden">
        {/* THEME-REDESIGN [TB-001]: Left Column - Settings Panel */}
        <div className={`w-full lg:w-[45%] xl:w-[40%] flex flex-col border-r bg-muted/30 ${mobileActiveTab === "preview" ? "hidden lg:flex" : "flex"}`}>
          <ScrollArea className="flex-1 px-4 py-6">
            <div className="max-w-xl mx-auto space-y-6">
              
              {/* THEME-REDESIGN [TB-008, TB-011]: Integrated Toolbar Card */}
              <Card>
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="theme-name" className="ov-label text-[11px]">
                          {t("theme_builder.theme_name_label")}
                        </Label>
                        <Input
                          id="theme-name"
                          readOnly={locked}
                          value={locked ? t("theme_builder.standard_name", "Standard") : themeName}
                          onChange={(e) => {
                            setThemeName(e.target.value);
                            setHasUnsavedChanges(true);
                          }}
                          className="max-w-xs h-9 bg-background/50"
                        />
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {hasUnsavedChanges ? (
                          <span className="ov-chip ov-chip-star h-5 px-2 text-[11px]">
                            Unsaved Changes
                          </span>
                        ) : (
                          <span className="ov-chip ov-chip-success h-5 px-2 text-[11px] text-foreground">
                            All Saved
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={undo} disabled={locked || historyIndex.current <= 0} title="Undo (Ctrl+Z)">
                        <History className="h-4 w-4 rotate-180" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={redo} disabled={locked || historyIndex.current >= history.current.length - 1} title="Redo (Ctrl+Y)">
                        <History className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Select 
                      value={locked ? "standard" : activeThemeId?.toString() || ""}
                      onValueChange={(val) => {
                        if (val === "standard") return handleUseStandard();
                        const theme = savedThemes.find(t => t.id.toString() === val);
                        if (theme) loadTheme(theme);
                      }}
                    >
                      <SelectTrigger className="flex-1 h-9" aria-label={t("theme_builder.choose_theme", "Choose theme")}>
                        <SelectValue placeholder="Select Theme..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">{t("theme_builder.standard_name", "Standard")}</SelectItem>
                        {savedThemes.map(t => (
                          <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={handleSave} className="h-9 gap-2" disabled={locked || (!hasUnsavedChanges && activeThemeId !== null)}>
                      <Save className="h-4 w-4" />
                      Save
                    </Button>
                  </div>
                  
                  <Separator />
                  
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Button variant="outline" size="sm" onClick={handleCreateNew} className="text-xs h-8">
                      <Plus className="h-3 w-3 mr-1.5" /> New
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleImport} className="text-xs h-8">
                      <Upload className="h-3 w-3 mr-1.5" /> Import
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExport} className="text-xs h-8">
                      <Download className="h-3 w-3 mr-1.5" /> Export
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleUseStandard} disabled={locked} className="text-xs h-8">
                      <RotateCcw className="h-3 w-3 mr-1.5" /> {t("theme_builder.use_standard", "Standard")}
                    </Button>
                  </div>
                  
                  <Separator />
                  
                  {!locked && <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={handleShuffle} className="flex-1 text-xs h-9 bg-primary/10 text-primary hover:bg-primary/20">
                      <Shuffle className="h-3.5 w-3.5 mr-2" />
                      Shuffle
                    </Button>
                    <Button variant="secondary" size="sm" onClick={handleHarmonize} className="flex-1 text-xs h-9 bg-accent/10 text-accent-foreground hover:bg-accent/20">
                      <Sparkles className="h-3.5 w-3.5 mr-2" />
                      Harmonize
                    </Button>
                  </div>}
                </CardContent>
              </Card>

              {locked && (
                <Card className="ov-panel-active">
                  <CardHeader className="pb-2 px-4">
                    <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                      <Lock className="h-5 w-5" />
                      {t("theme_builder.standard_locked_title", "Standard design")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-3 text-sm">
                    <p>
                      {t("theme_builder.standard_locked_desc", "The standard design is tuned for accessibility: all text meets WCAG AAA contrast (at least 7:1), borders and input fields at least 3:1, and motion stops when your system asks for reduced motion. That is why it cannot be changed.")}
                    </p>
                    <p className="text-muted-foreground">
                      {t("theme_builder.standard_locked_hint", "To change colours, shapes or fonts, create your own theme. It starts as a copy of the standard design.")}
                    </p>
                    <Button onClick={handleCreateNew} className="gap-2">
                      <Plus className="h-4 w-4" />
                      {t("theme_builder.create_own", "Create your own theme")}
                    </Button>
                  </CardContent>
                </Card>
              )}

              {!locked && (<>
              {/* Shape: corner style, corner size, avatar shape */}
              <Card>
                <CardHeader className="pb-3 px-4">
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                    <Hexagon className="h-5 w-5" />
                    {t("theme_builder.section_shape", "Shape")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-5">
                  <div className="space-y-2">
                    <p id="theme-corner-style" className="text-xs font-semibold">
                      {t("theme_builder.corner_style", "Corner style")}
                    </p>
                    <SegmentedControl
                      labelledBy="theme-corner-style"
                      options={cornerStyleOptions}
                      value={shape.style}
                      onChange={(style) => handleShapeChange({ style })}
                    />
                  </div>

                  <RangeSetting
                    label={t("theme_builder.corner_size", "Corner size")}
                    valueLabel={`${shape.size}px`}
                    value={shape.size}
                    min={0}
                    max={24}
                    step={1}
                    disabled={shape.style === "kante"}
                    onChange={(size) => handleShapeChange({ size }, false)}
                    onCommit={(size) => handleShapeChange({ size })}
                  />

                  <div className="space-y-2">
                    <p id="theme-avatar-shape" className="text-xs font-semibold">
                      {t("theme_builder.avatar_shape", "Avatar shape")}
                    </p>
                    <SegmentedControl
                      labelledBy="theme-avatar-shape"
                      options={avatarShapeOptions}
                      value={shape.avatar}
                      onChange={(avatar) => handleShapeChange({ avatar })}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Surface: panel material, opacity, blur */}
              <Card>
                <CardHeader className="pb-3 px-4">
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                    <PanelTop className="h-5 w-5" />
                    {t("theme_builder.section_surface", "Surface")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-5">
                  <SegmentedControl
                    ariaLabel={t("theme_builder.section_surface", "Surface")}
                    options={surfaceModeOptions}
                    value={surface.mode}
                    onChange={(mode) => handleSurfaceChange({ mode })}
                  />

                  <RangeSetting
                    label={t("theme_builder.surface_opacity", "Opacity")}
                    valueLabel={`${Math.round(surface.opacity * 100)}%`}
                    value={Math.round(surface.opacity * 100)}
                    min={0}
                    max={100}
                    step={1}
                    disabled={surface.mode === "kontur"}
                    onChange={(value) => handleSurfaceChange({ opacity: value / 100 }, false)}
                    onCommit={(value) => handleSurfaceChange({ opacity: value / 100 })}
                  />

                  <RangeSetting
                    label={t("theme_builder.surface_blur", "Blur")}
                    valueLabel={`${Math.round(effectiveBlur)}px`}
                    value={effectiveBlur}
                    min={minBlur}
                    max={24}
                    step={1}
                    onChange={(blur) => handleSurfaceChange({ blur }, false)}
                    onCommit={(blur) => handleSurfaceChange({ blur })}
                  />
                </CardContent>
              </Card>

              {/* Typography: headings, text, numbers & times */}
              <Card>
                <CardHeader className="pb-3 px-4">
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                    <Type className="h-5 w-5" />
                    Typography
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="space-y-4">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="theme-font-display" className="text-sm font-semibold">
                        {t("theme_builder.font_display", "Headings")}
                      </Label>
                      <Select value={fonts.display} onValueChange={(value) => handleFontChange("display", value)}>
                        <SelectTrigger id="theme-font-display" className="w-full h-10">
                          <SelectValue placeholder="Select a font" />
                        </SelectTrigger>
                        <SelectContent>
                          {withCurrentFont(availableFonts, fonts.display).map((font) => (
                            <SelectItem key={font.name} value={font.name} style={{ fontFamily: font.family }}>
                              {font.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="theme-font-body" className="text-sm font-semibold">
                        {t("theme_builder.font_body", "Text")}
                      </Label>
                      <Select value={fonts.body} onValueChange={(value) => handleFontChange("body", value)}>
                        <SelectTrigger id="theme-font-body" className="w-full h-10">
                          <SelectValue placeholder="Select a font" />
                        </SelectTrigger>
                        <SelectContent>
                          {withCurrentFont(availableFonts, fonts.body).map((font) => (
                            <SelectItem key={font.name} value={font.name} style={{ fontFamily: font.family }}>
                              {font.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="theme-font-data" className="text-sm font-semibold">
                        {t("theme_builder.font_data", "Numbers & times")}
                      </Label>
                      <Select value={fonts.data} onValueChange={(value) => handleFontChange("data", value)}>
                        <SelectTrigger id="theme-font-data" className="w-full h-10">
                          <SelectValue placeholder="Select a font" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={fonts.body} style={{ fontFamily: fonts.body }}>
                            {t("theme_builder.font_same_as_text", "Same as text")} ({fonts.body})
                          </SelectItem>
                          {hasUnlistedDataFont && (
                            <SelectItem value={fonts.data} style={{ fontFamily: fonts.data }}>
                              {fonts.data}
                            </SelectItem>
                          )}
                          {dataFontOptions.map((font) => (
                            <SelectItem key={font.name} value={font.name} style={{ fontFamily: font.family }}>
                              {font.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Background */}
              <Card>
                <CardHeader className="pb-3 px-4">
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                    <Layers className="h-5 w-5" />
                    Background Style
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-6">
                  <SegmentedControl
                    ariaLabel="Background Style"
                    options={backgroundModeOptions}
                    value={workingTheme.background?.mode || "solid"}
                    onChange={handleBgModeChange}
                  />

                  {workingTheme.background?.mode === "gradient" && (
                    <div className="grid grid-cols-3 gap-2">
                      {galaxyGradients.map((g) => (
                        <button
                          key={g.name}
                          onClick={() => {
                            const updated = { ...workingTheme, background: { ...workingTheme.background!, mode: "gradient" as const, gradient: g.value } };
                            setWorkingTheme(updated);
                            setHasUnsavedChanges(true);
                            pushToHistory(updated);
                          }}
                          className={`h-12 rounded-md border-2 transition-all ${
                            workingTheme.background?.gradient === g.value ? "border-primary ring-2 ring-primary/20" : "border-transparent"
                          }`}
                          style={{ background: g.value }}
                        />
                      ))}
                    </div>
                  )}

                  {workingTheme.background?.mode === "image" && (
                    <div className="space-y-3">
                      <Label className="text-xs font-semibold">Custom Background Image</Label>
                      <label className="flex flex-col items-center justify-center h-24 rounded-lg border-2 border-dashed border-border hover:border-primary/50 cursor-pointer transition-colors bg-muted/20">
                        {bgUploading ? (
                          <Badge variant="outline">Uploading...</Badge>
                        ) : (
                          <>
                            <Image className="h-6 w-6 text-muted-foreground mb-1" />
                            <span className="text-xs font-medium">Click to upload image</span>
                          </>
                        )}
                        <input type="file" className="hidden" onChange={handleBgImageUpload} accept="image/*" />
                      </label>
                    </div>
                  )}

                  <div className="space-y-4 pt-2">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold flex items-center gap-2">
                          <Sun className="h-3 w-3" />
                          Brightness
                        </Label>
                        <span className="ov-data text-xs text-muted-foreground">
                          {Math.round((workingTheme.background?.overlay.brightness ?? 1) * 100)}%
                        </span>
                      </div>
                      <Slider
                        aria-label="Brightness"
                        value={[workingTheme.background?.overlay.brightness ?? 1]}
                        min={0.1}
                        max={2}
                        step={0.05}
                        onValueChange={([val]) => {
                          const updated = { ...workingTheme, background: { ...workingTheme.background!, overlay: { ...workingTheme.background!.overlay, brightness: val } } };
                          setWorkingTheme(updated);
                          setHasUnsavedChanges(true);
                        }}
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold flex items-center gap-2">
                          <ContrastIcon className="h-3 w-3" />
                          Contrast
                        </Label>
                        <span className="ov-data text-xs text-muted-foreground">
                          {Math.round((workingTheme.background?.overlay.contrast ?? 1) * 100)}%
                        </span>
                      </div>
                      <Slider
                        aria-label="Contrast"
                        value={[workingTheme.background?.overlay.contrast ?? 1]}
                        min={0.1}
                        max={2}
                        step={0.05}
                        onValueChange={([val]) => {
                          const updated = { ...workingTheme, background: { ...workingTheme.background!, overlay: { ...workingTheme.background!.overlay, contrast: val } } };
                          setWorkingTheme(updated);
                          setHasUnsavedChanges(true);
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Galaxy layers: star field, grid, constellation, grain */}
              <Card>
                <CardHeader className="pb-3 px-4">
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                    <Orbit className="h-5 w-5" />
                    {t("theme_builder.section_galaxy", "Galaxy layers")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-4">
                  <ToggleSetting
                    id="theme-galaxy-stars"
                    label={t("theme_builder.galaxy_stars", "Star field")}
                    checked={galaxy.stars}
                    onChange={(stars) => handleGalaxyChange({ stars })}
                  />
                  <ToggleSetting
                    id="theme-galaxy-grid"
                    label={t("theme_builder.galaxy_grid", "Coordinate grid")}
                    checked={galaxy.grid}
                    onChange={(grid) => handleGalaxyChange({ grid })}
                  />
                  <ToggleSetting
                    id="theme-galaxy-constellation"
                    label={t("theme_builder.galaxy_constellation", "Constellation in page headers")}
                    checked={galaxy.constellation}
                    onChange={(constellation) => handleGalaxyChange({ constellation })}
                  />

                  <div className={`space-y-2 ${galaxy.constellation ? "" : "opacity-60"}`}>
                    <Label className="text-xs font-semibold">{t("theme_builder.constellation_choice", "Constellation")}</Label>
                    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("theme_builder.constellation_choice", "Constellation")}>
                      {CONSTELLATION_NAMES.map((name) => {
                        const active = galaxy.constellationName === name;
                        return (
                          <button
                            key={name}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            disabled={!galaxy.constellation}
                            onClick={() => handleGalaxyChange({ constellationName: name })}
                            className={`ov-panel ov-panel-hover flex flex-col gap-1 p-2 text-left ${active ? "ov-panel-active" : ""}`}
                          >
                            {name === "auto" ? (
                              <span className="flex h-12 items-center justify-center font-data text-xs text-muted-foreground">
                                {t("theme_builder.constellation_auto_hint", "different on every page")}
                              </span>
                            ) : (
                              <StarChart name={name} className="h-12 w-full !block" />
                            )}
                            <span className="text-xs font-medium">
                              {name === "auto" ? t("theme_builder.constellation_auto", "Changing") : STAR_CHARTS[name].label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <Separator />

                  <RangeSetting
                    label={t("theme_builder.galaxy_grain", "Grain")}
                    valueLabel={`${Math.round(galaxy.grain * 100)}%`}
                    value={Math.round(galaxy.grain * 100)}
                    min={0}
                    max={30}
                    step={1}
                    onChange={(value) => handleGalaxyChange({ grain: value / 100 }, false)}
                    onCommit={(value) => handleGalaxyChange({ grain: value / 100 })}
                  />
                </CardContent>
              </Card>

              {/* ✦ Particles Section */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                    <span className="text-base text-star">✦</span> Particles
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Cursor-following star particles. Customise core dot and glow halo colors.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Enable/Disable toggle */}
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Enable Particles</Label>
                    <Checkbox
                      checked={workingTheme.particles?.enabled ?? defaultParticles.enabled}
                      onCheckedChange={(val) => {
                        const updated = {
                          ...workingTheme,
                          particles: { ...(workingTheme.particles || defaultParticles), enabled: !!val },
                        };
                        setWorkingTheme(updated);
                        applyParticleConfig(updated.particles);
                        setHasUnsavedChanges(true);
                        pushToHistory(updated);
                      }}
                    />
                  </div>

                  <Separator />

                  {/* Core Color */}
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label className="text-xs font-medium">Core Dot Color</Label>
                      <p className="text-xs text-muted-foreground">Bright center of each particle</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-6 w-6 rounded-full border border-border"
                        style={{ backgroundColor: workingTheme.particles?.coreColor ?? defaultParticles.coreColor }}
                      />
                      <input
                        type="color"
                        value={workingTheme.particles?.coreColor ?? defaultParticles.coreColor}
                        className="h-8 w-16 cursor-pointer rounded-sm border border-border bg-transparent"
                        onChange={(e) => {
                          const updated = {
                            ...workingTheme,
                            particles: { ...(workingTheme.particles || defaultParticles), coreColor: e.target.value },
                          };
                          setWorkingTheme(updated);
                          applyParticleConfig(updated.particles);
                          setHasUnsavedChanges(true);
                        }}
                        onBlur={() => pushToHistory(workingTheme)}
                      />
                    </div>
                  </div>

                  {/* Glow Color */}
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label className="text-xs font-medium">Glow Halo Color</Label>
                      <p className="text-xs text-muted-foreground">Soft light surrounding each particle</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-6 w-6 rounded-full border border-border"
                        style={{ backgroundColor: workingTheme.particles?.glowColor ?? defaultParticles.glowColor }}
                      />
                      <input
                        type="color"
                        value={workingTheme.particles?.glowColor ?? defaultParticles.glowColor}
                        className="h-8 w-16 cursor-pointer rounded-sm border border-border bg-transparent"
                        onChange={(e) => {
                          const updated = {
                            ...workingTheme,
                            particles: { ...(workingTheme.particles || defaultParticles), glowColor: e.target.value },
                          };
                          setWorkingTheme(updated);
                          applyParticleConfig(updated.particles);
                          setHasUnsavedChanges(true);
                        }}
                        onBlur={() => pushToHistory(workingTheme)}
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* Particle Settings */}
                  <div className="space-y-4 pt-2">
                    {/* Twinkle Toggle */}
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Twinkle Effect</Label>
                      <Checkbox
                        checked={workingTheme.particles?.twinkle ?? defaultParticles.twinkle}
                        onCheckedChange={(val) => {
                          const updated = {
                            ...workingTheme,
                            particles: { ...(workingTheme.particles || defaultParticles), twinkle: !!val },
                          };
                          setWorkingTheme(updated);
                          applyParticleConfig(updated.particles);
                          setHasUnsavedChanges(true);
                          pushToHistory(updated);
                        }}
                      />
                    </div>

                    {/* Speed Slider */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold flex items-center gap-2">Speed</Label>
                        <span className="ov-data text-xs text-muted-foreground">
                          {Math.round((workingTheme.particles?.speed ?? defaultParticles.speed) * 100)}%
                        </span>
                      </div>
                      <Slider
                        aria-label="Speed"
                        value={[workingTheme.particles?.speed ?? defaultParticles.speed]}
                        min={0.1}
                        max={3}
                        step={0.1}
                        onValueChange={([val]) => {
                          const updated = {
                            ...workingTheme,
                            particles: { ...(workingTheme.particles || defaultParticles), speed: val },
                          };
                          setWorkingTheme(updated);
                          applyParticleConfig(updated.particles);
                          setHasUnsavedChanges(true);
                        }}
                        onValueCommit={() => pushToHistory(workingTheme)}
                      />
                    </div>

                    {/* Attraction Slider */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold flex items-center gap-2">Cursor Pull</Label>
                        <span className="ov-data text-xs text-muted-foreground">
                          {Math.round(((workingTheme.particles?.attraction ?? defaultParticles.attraction) / 0.008) * 100)}%
                        </span>
                      </div>
                      <Slider
                        aria-label="Cursor Pull"
                        value={[workingTheme.particles?.attraction ?? defaultParticles.attraction]}
                        min={0}
                        max={0.03}
                        step={0.001}
                        onValueChange={([val]) => {
                          const updated = {
                            ...workingTheme,
                            particles: { ...(workingTheme.particles || defaultParticles), attraction: val },
                          };
                          setWorkingTheme(updated);
                          applyParticleConfig(updated.particles);
                          setHasUnsavedChanges(true);
                        }}
                        onValueCommit={() => pushToHistory(workingTheme)}
                      />
                    </div>

                    {/* Size Slider */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold flex items-center gap-2">Size</Label>
                        <span className="ov-data text-xs text-muted-foreground">
                          {Math.round((workingTheme.particles?.size ?? defaultParticles.size) * 100)}%
                        </span>
                      </div>
                      <Slider
                        aria-label="Size"
                        value={[workingTheme.particles?.size ?? defaultParticles.size]}
                        min={0.5}
                        max={4}
                        step={0.1}
                        onValueChange={([val]) => {
                          const updated = {
                            ...workingTheme,
                            particles: { ...(workingTheme.particles || defaultParticles), size: val },
                          };
                          setWorkingTheme(updated);
                          applyParticleConfig(updated.particles);
                          setHasUnsavedChanges(true);
                        }}
                        onValueCommit={() => pushToHistory(workingTheme)}
                      />
                    </div>

                    {/* Glow Strength Slider */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold flex items-center gap-2">Glow Strength</Label>
                        <span className="ov-data text-xs text-muted-foreground">
                          {Math.round((workingTheme.particles?.glowStrength ?? defaultParticles.glowStrength) * 100)}%
                        </span>
                      </div>
                      <Slider
                        aria-label="Glow Strength"
                        value={[workingTheme.particles?.glowStrength ?? defaultParticles.glowStrength]}
                        min={0}
                        max={5}
                        step={0.1}
                        onValueChange={([val]) => {
                          const updated = {
                            ...workingTheme,
                            particles: { ...(workingTheme.particles || defaultParticles), glowStrength: val },
                          };
                          setWorkingTheme(updated);
                          applyParticleConfig(updated.particles);
                          setHasUnsavedChanges(true);
                        }}
                        onValueCommit={() => pushToHistory(workingTheme)}
                      />
                    </div>
                  </div>

                  {/* Reset to default */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs h-7"
                    onClick={() => {
                      const updated = { ...workingTheme, particles: defaultParticles };
                      setWorkingTheme(updated);
                      applyParticleConfig(defaultParticles);
                      setHasUnsavedChanges(true);
                      pushToHistory(updated);
                    }}
                  >
                    Reset to Default
                  </Button>
                </CardContent>
              </Card>

              {/* Colors Sections */}
              <Tabs value={activeMode} onValueChange={(v) => setActiveMode(v as "light" | "dark")} className="w-full">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      id="unified" 
                      checked={unifiedMode} 
                      onCheckedChange={(val) => {
                        setUnifiedMode(!!val);
                        if (val) {
                          const updated = { ...workingTheme, light: workingTheme[activeMode], dark: workingTheme[activeMode], unified: true };
                          setWorkingTheme(updated);
                          pushToHistory(updated);
                          setHasUnsavedChanges(true);
                        }
                      }} 
                    />
                    <Label htmlFor="unified" className="text-xs font-medium">Link Light/Dark Modes</Label>
                  </div>
                  {!unifiedMode && (
                    <TabsList className="h-8 p-1">
                      <TabsTrigger value="light" className="text-xs px-3">Light</TabsTrigger>
                      <TabsTrigger value="dark" className="text-xs px-3">Dark</TabsTrigger>
                    </TabsList>
                  )}
                </div>

                <div className="space-y-4">
                  <ThemeGroup
                    title="Layout Colors"
                    icon={<Square className="h-5 w-5" />}
                    colors={currentColors}
                    defaultColors={defaultColors}
                    colorKeys={["background", "card", "popover", "border", "input"]}
                    onColorChange={handleColorChange}
                    descriptions={descriptions}
                  />

                  <ThemeGroup
                    title="Typography"
                    icon={<Type className="h-5 w-5" />}
                    colors={currentColors}
                    defaultColors={defaultColors}
                    colorKeys={["foreground", "cardForeground", "popoverForeground", "mutedForeground"]}
                    onColorChange={handleColorChange}
                    descriptions={descriptions}
                    contrastPairs={contrastPairs}
                  />

                  <ThemeGroup
                   title="Brand & Interactive"
                   icon={<MousePointer className="h-5 w-5" />}
                   colors={currentColors}
                   defaultColors={defaultColors}
                   colorKeys={["primary", "primaryForeground", "secondary", "secondaryForeground", "accent", "star", "ring", "destructive"]}
                   onColorChange={handleColorChange}
                   descriptions={descriptions}
                   contrastPairs={contrastPairs}
                   labels={colorLabels}
                  />
                </div>
              </Tabs>
              </>)}
            </div>
          </ScrollArea>
        </div>

        {/* THEME-REDESIGN [TB-001]: Right Column - Sticky Preview */}
        <div className={`lg:flex flex-1 flex-col bg-muted/10 ${mobileActiveTab === "settings" ? "hidden lg:flex" : "flex"}`}>
          <div className="flex items-center justify-between px-6 py-4 border-b bg-background">
            <h2 className="flex items-center gap-2">
              <span className="ov-label">Live App Preview</span>
              <span className="ov-chip ov-chip-primary h-5 px-2 text-[11px]">Real-time</span>
            </h2>
            <div className="flex items-center gap-1 rounded-pill border border-border p-1">
              <Button 
                variant={previewSize === "desktop" ? "default" : "ghost"} 
                size="icon" 
                className="h-7 w-7"
                aria-label="Desktop preview"
                aria-pressed={previewSize === "desktop"}
                onClick={() => setPreviewSize("desktop")}
              >
                <Monitor className="h-4 w-4" />
              </Button>
              <Button 
                variant={previewSize === "mobile" ? "default" : "ghost"} 
                size="icon" 
                className="h-7 w-7"
                aria-label="Mobile preview"
                aria-pressed={previewSize === "mobile"}
                onClick={() => setPreviewSize("mobile")}
              >
                <Smartphone className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <ScrollArea className="flex-1 p-8">
            <div className={`mx-auto relative transition-all duration-300 ${previewSize === "mobile" ? "max-w-[375px] border-[8px] border-border rounded-xl h-[700px] overflow-hidden bg-background" : "max-w-4xl"}`}>
              {/* THEME-REDESIGN [TB-001]: Background preview inside the mockup frame */}
              <div className="absolute inset-0 -z-10 overflow-hidden rounded-lg">
                <ThemeBackground background={locked ? undefined : workingTheme.background} isDark={activeMode === "dark"} />
              </div>

              {/* THEME-REDESIGN [TB-002]: Realistic UI Preview */}
              <div className="relative space-y-8 p-4 min-h-full">
                {/* Mock Navbar */}
                <Card className="overflow-hidden">
                  <div className="h-14 px-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="ov-cut h-8 w-8 rounded-sm bg-primary flex items-center justify-center">
                        <Palette className="h-5 w-5 text-primary-foreground" />
                      </div>
                      <span className="font-display text-sm font-semibold">Osiris App</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-4 w-12 bg-muted rounded-pill" />
                      <div className="h-4 w-12 bg-muted rounded-pill" />
                      <div className="ov-avatar h-8 w-8 bg-accent" />
                    </div>
                  </div>
                </Card>

                {/* Hero / Stat Section */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { label: "Followers", value: "1.2k", icon: Users, star: false },
                    { label: "Karma", value: "840", icon: Sparkles, star: true },
                    { label: "Posts", value: "142", icon: FileText, star: false },
                  ].map((s) => (
                    <Card key={s.label} className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <span className="ov-label">{s.label}</span>
                        <s.icon className={`h-4 w-4 ${s.star ? "text-star" : "text-muted-foreground"}`} />
                      </div>
                      <p className="ov-data text-2xl font-semibold text-foreground">{s.value}</p>
                    </Card>
                  ))}
                </div>

                {/* Sample Post Card */}
                <Card className="overflow-hidden">
                  <div className="p-4 space-y-4">
                    <div className="flex items-center gap-3">
                      <UserAvatar user={{ username: "Designer" }} size="sm" />
                      <div>
                        <p className="flex items-center gap-1 text-sm font-semibold text-foreground">
                          Creative Lead
                          <BadgeCheck className="h-3.5 w-3.5 text-star" />
                        </p>
                        <p className="ov-data text-[11px] text-muted-foreground">2 hours ago</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h3 className="font-display text-base font-semibold text-foreground leading-tight">Implementing the new Theme Builder design system!</h3>
                      <p className="text-sm text-foreground/90 leading-relaxed">
                        The two-column layout provides a much better workflow. It's now possible to see every color tweak in real-time without scrolling.
                      </p>
                    </div>
                    {/* Media placeholder: shows the cut corners on images and the coordinate grid */}
                    <div className="ov-cut-2 ov-grid h-28 rounded-xl bg-muted" />
                    <div className="flex flex-wrap gap-2">
                      <span className="ov-chip ov-chip-primary">#UX</span>
                      <span className="ov-chip">#FrontEnd</span>
                    </div>
                    <Separator className="bg-border/50" />
                    <div className="flex items-center justify-between">
                      <div className="flex gap-4">
                        <Button variant="ghost" size="sm" className="h-8 gap-2 text-xs">
                          <Heart /> <span className="ov-data">24</span>
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 gap-2 text-xs">
                          <MessageCircle /> <span className="ov-data">8</span>
                        </Button>
                      </div>
                      <Button variant="outline" size="sm" className="h-8 px-3 text-xs">Read More</Button>
                    </div>
                  </div>
                </Card>

                {/* Interactive Elements / Form */}
                <Card className="p-6 space-y-6">
                  <div className="space-y-2">
                    <h3 className="font-display text-lg font-semibold text-foreground">Interactive Elements</h3>
                    <p className="text-xs text-muted-foreground">Test your interactive and modal colors here.</p>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Join the conversation</Label>
                      <div className="flex gap-2">
                        <Input placeholder="Type something..." className="h-9 text-xs bg-background" />
                        <Button size="sm" className="h-9 px-4">Send</Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button variant="default" size="sm">Primary</Button>
                      <Button variant="secondary" size="sm">Secondary</Button>
                      <Button variant="outline" size="sm">Outline</Button>
                      <Button variant="ghost" size="sm">Ghost</Button>
                      <Button variant="destructive" size="sm">Destructive</Button>
                    </div>
                  </div>
                  
                  <div className="ov-panel p-4 flex items-start gap-3">
                    <Info className="h-4 w-4 text-primary mt-0.5" />
                    <div className="space-y-1">
                      <p className="ov-label">Pro Tip</p>
                      <p className="text-xs text-muted-foreground leading-normal">
                        Use the <strong>Contrast Checker</strong> icons next to text colors to ensure your theme remains accessible for everyone.
                      </p>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </ScrollArea>
        </div>
      </main>

      {/* Mobile Actions Overlay - Logic for TB-001 mobile tabs */}
      <div className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 flex gap-1 rounded-pill border border-border bg-background p-1 z-50">
        <Button
          variant={mobileActiveTab === "settings" ? "default" : "ghost"}
          size="sm"
          className="rounded-pill px-6 h-9"
          onClick={() => setMobileActiveTab("settings")}
        >
          Settings
        </Button>
        <Button
          variant={mobileActiveTab === "preview" ? "default" : "ghost"}
          size="sm"
          className="rounded-pill px-6 h-9"
          onClick={() => setMobileActiveTab("preview")}
        >
          Preview
        </Button>
      </div>
    </div>
  );
}
