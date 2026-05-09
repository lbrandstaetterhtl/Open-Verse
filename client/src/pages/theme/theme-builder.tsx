import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
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
  generateRandomTheme,
} from "@/lib/theme-utils";
import { useToast } from "@/hooks/use-toast";
import type { ThemeColors, CustomTheme, BackgroundMode, ParticleConfig } from "@/lib/theme-utils";
import { galaxyGradients, defaultBackground, defaultParticles, applyParticleConfig } from "@/lib/theme-utils";
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
};

export default function ThemeBuilderPage() {
  const { t } = useTranslation();
  const [, _setLocation] = useLocation();
  const {
    customTheme,
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
  
  const [activeMode, setActiveMode] = useState<"light" | "dark">("light");
  const [workingTheme, setWorkingTheme] = useState<CustomTheme>(customTheme);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [themeName, setThemeName] = useState("My Custom Theme");
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
  }, [workingTheme, themeName, activeThemeId]);

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

  // Live Preview Sync - [FIX: Follow activeMode instead of global isDark]
  useEffect(() => {
    // Apply the colors from the tab the user is currently editing
    const isDarkMode = activeMode === "dark";
    applyTheme(workingTheme[activeMode], isDarkMode, workingTheme.font, workingTheme.background);
    
    // Toggle the .dark class on the root to ensure shadcn components respond correctly
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    
    window.dispatchEvent(new CustomEvent("open-verse-preview-bg", { 
      detail: workingTheme.background ?? null 
    }));
    
    // Cleanup: restore global theme when leaving component
    return () => {
      // Cleanup: ThemeProvider will take over on next render.
      // This is a bit tricky since we don't want to break the app's dark mode setting,
      // but the ThemeProvider will usually take over on next render or mount.
    };
  }, [workingTheme, activeMode]);

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
  const handleFontChange = (value: string) => {
    setWorkingTheme((prev) => {
      const updated = { ...prev, font: value };
      pushToHistory(updated);
      return updated;
    });
    setHasUnsavedChanges(true);
  };

  const handleShuffle = () => {
    const newTheme = generateRandomTheme();
    setWorkingTheme(newTheme);
    setHasUnsavedChanges(true);
    pushToHistory(newTheme);
    toast({ title: "Theme Shuffled", description: "A new harmonious palette has been generated." });
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
    toast({ title: "Theme Harmonized", description: "Colors have been adjusted to match your Primary color." });
  };

  const handleSave = async () => {
    try {
      importCustomTheme(workingTheme);
      const saved = await saveThemeAs(themeName, activeThemeId || undefined, workingTheme);
      setActiveThemeId(saved.id);
      setActiveThemeInfo(saved.id, saved.name);
      setHasUnsavedChanges(false);
      toast({ title: t("theme.saved"), description: t("theme.saved_desc", { name: themeName }) });
    } catch {
      toast({ title: t("theme.save_failed"), variant: "destructive" });
    }
  };

  const handleCreateNew = () => {
    setThemeName("New Theme");
    setActiveThemeId(null);
    clearActiveThemeInfo();
    setWorkingTheme(defaultTheme);
    setUnifiedMode(false);
    setHasUnsavedChanges(true);
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
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setBgUploading(false);
    }
  };

  const descriptions = Object.fromEntries(
    Object.entries(COLOR_METADATA).map(([key, meta]) => [key, meta.description])
  ) as Partial<Record<keyof ThemeColors, string>>;

  const contrastPairs = Object.fromEntries(
    Object.entries(COLOR_METADATA)
      .filter(([, meta]) => meta.contrastAgainst)
      .map(([key, meta]) => [key, meta.contrastAgainst])
  ) as Partial<Record<keyof ThemeColors, keyof ThemeColors>>;

  const currentColors = workingTheme[activeMode];
  const defaultColors = defaultTheme[activeMode];

  return (
    <div className="flex flex-col min-h-screen bg-transparent">
      {/* THEME-REDESIGN [TB-011]: Use normal Navbar */}
      
      <main className="flex-1 flex flex-col lg:flex-row h-[calc(100vh-3.5rem)] mt-14 overflow-hidden">
        {/* THEME-REDESIGN [TB-001]: Left Column - Settings Panel */}
        <div className={`w-full lg:w-[45%] xl:w-[40%] flex flex-col border-r bg-muted/30 ${mobileActiveTab === "preview" ? "hidden lg:flex" : "flex"}`}>
          <ScrollArea className="flex-1 px-4 py-6">
            <div className="max-w-xl mx-auto space-y-6">
              
              {/* THEME-REDESIGN [TB-008, TB-011]: Integrated Toolbar Card */}
              <Card className="shadow-md border-primary/20 bg-card">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="theme-name" className="text-xs font-semibold uppercase tracking-wider opacity-70">
                          {t("theme_builder.theme_name_label")}
                        </Label>
                        <Input
                          id="theme-name"
                          value={themeName}
                          onChange={(e) => {
                            setThemeName(e.target.value);
                            setHasUnsavedChanges(true);
                          }}
                          className="max-w-xs h-9 bg-background/50"
                        />
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {hasUnsavedChanges ? (
                          <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/20 py-0 h-4">
                            Unsaved Changes
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20 py-0 h-4">
                            All Saved
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={undo} disabled={historyIndex.current <= 0} title="Undo (Ctrl+Z)">
                        <History className="h-4 w-4 rotate-180" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={redo} disabled={historyIndex.current >= history.current.length - 1} title="Redo (Ctrl+Y)">
                        <History className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Select 
                      value={activeThemeId?.toString() || ""} 
                      onValueChange={(val) => {
                        const theme = savedThemes.find(t => t.id.toString() === val);
                        if (theme) loadTheme(theme);
                      }}
                    >
                      <SelectTrigger className="flex-1 h-9">
                        <SelectValue placeholder="Select Theme..." />
                      </SelectTrigger>
                      <SelectContent>
                        {savedThemes.map(t => (
                          <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={handleSave} className="h-9 gap-2 shadow-sm" disabled={!hasUnsavedChanges && activeThemeId !== null}>
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
                    <Button variant="outline" size="sm" onClick={resetTheme} className="text-xs h-8 text-destructive hover:text-destructive">
                      <RotateCcw className="h-3 w-3 mr-1.5" /> Reset
                    </Button>
                  </div>
                  
                  <Separator />
                  
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={handleShuffle} className="flex-1 text-xs h-9 bg-primary/10 text-primary hover:bg-primary/20 border-primary/20">
                      <Shuffle className="h-3.5 w-3.5 mr-2" />
                      Shuffle
                    </Button>
                    <Button variant="secondary" size="sm" onClick={handleHarmonize} className="flex-1 text-xs h-9 bg-accent/10 text-accent-foreground hover:bg-accent/20 border-accent/20">
                      <Sparkles className="h-3.5 w-3.5 mr-2" />
                      Harmonize
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Typography */}
              <Card className="shadow-sm">
                <CardHeader className="pb-3 px-4">
                  <CardTitle className="flex items-center gap-2 text-lg font-bold">
                    <Type className="h-5 w-5" />
                    Typography
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="space-y-4">
                    <div className="flex flex-col gap-2">
                      <Label className="text-sm font-semibold">Font Family</Label>
                      <Select value={workingTheme.font || "Inter"} onValueChange={handleFontChange}>
                        <SelectTrigger className="w-full h-10">
                          <SelectValue placeholder="Select a font" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableFonts.map((font) => (
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
              <Card className="shadow-sm">
                <CardHeader className="pb-3 px-4">
                  <CardTitle className="flex items-center gap-2 text-lg font-bold">
                    <Layers className="h-5 w-5" />
                    Background Style
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-6">
                  <div className="flex p-1 bg-muted rounded-lg w-full">
                    {["solid", "gradient", "image"].map((mode) => (
                      <button
                        key={mode}
                        onClick={() => handleBgModeChange(mode as BackgroundMode)}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                          (workingTheme.background?.mode || "solid") === mode 
                          ? "bg-background shadow-sm text-foreground" 
                          : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {mode.charAt(0).toUpperCase() + mode.slice(1)}
                      </button>
                    ))}
                  </div>

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
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {Math.round((workingTheme.background?.overlay.brightness ?? 1) * 100)}%
                        </span>
                      </div>
                      <Slider
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
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {Math.round((workingTheme.background?.overlay.contrast ?? 1) * 100)}%
                        </span>
                      </div>
                      <Slider
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

              {/* ✦ Particles Section */}
              <Card className="shadow-md border-primary/20 bg-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <span className="text-base">✦</span> Particles
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
                      <p className="text-[10px] text-muted-foreground">Bright center of each particle</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-6 w-6 rounded-full border border-border shadow-sm"
                        style={{ backgroundColor: workingTheme.particles?.coreColor ?? defaultParticles.coreColor }}
                      />
                      <input
                        type="color"
                        value={workingTheme.particles?.coreColor ?? defaultParticles.coreColor}
                        className="h-8 w-16 cursor-pointer rounded border border-border bg-transparent"
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
                      <p className="text-[10px] text-muted-foreground">Soft light surrounding each particle</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-6 w-6 rounded-full border border-border shadow-sm"
                        style={{ backgroundColor: workingTheme.particles?.glowColor ?? defaultParticles.glowColor }}
                      />
                      <input
                        type="color"
                        value={workingTheme.particles?.glowColor ?? defaultParticles.glowColor}
                        className="h-8 w-16 cursor-pointer rounded border border-border bg-transparent"
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
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {Math.round((workingTheme.particles?.speed ?? defaultParticles.speed) * 100)}%
                        </span>
                      </div>
                      <Slider
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
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {Math.round(((workingTheme.particles?.attraction ?? defaultParticles.attraction) / 0.008) * 100)}%
                        </span>
                      </div>
                      <Slider
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
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {Math.round((workingTheme.particles?.size ?? defaultParticles.size) * 100)}%
                        </span>
                      </div>
                      <Slider
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
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {Math.round((workingTheme.particles?.glowStrength ?? defaultParticles.glowStrength) * 100)}%
                        </span>
                      </div>
                      <Slider
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
                   colorKeys={["primary", "primaryForeground", "secondary", "secondaryForeground", "accent", "ring", "destructive"]}
                   onColorChange={handleColorChange}
                   descriptions={descriptions}
                   contrastPairs={contrastPairs}
                  />
                </div>
              </Tabs>
            </div>
          </ScrollArea>
        </div>

        {/* THEME-REDESIGN [TB-001]: Right Column - Sticky Preview */}
        <div className={`lg:flex flex-1 flex-col bg-muted/10 ${mobileActiveTab === "settings" ? "hidden lg:flex" : "flex"}`}>
          <div className="flex items-center justify-between px-6 py-4 border-b bg-background">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              Live App Preview
              <Badge variant="outline" className="text-[9px] h-4 py-0">Real-time</Badge>
            </h2>
            <div className="flex items-center gap-1 bg-muted p-1 rounded-md">
              <Button 
                variant={previewSize === "desktop" ? "default" : "ghost"} 
                size="icon" 
                className="h-7 w-7" 
                onClick={() => setPreviewSize("desktop")}
              >
                <Monitor className="h-4 w-4" />
              </Button>
              <Button 
                variant={previewSize === "mobile" ? "default" : "ghost"} 
                size="icon" 
                className="h-7 w-7" 
                onClick={() => setPreviewSize("mobile")}
              >
                <Smartphone className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <ScrollArea className="flex-1 p-8">
            <div className={`mx-auto relative transition-all duration-300 ${previewSize === "mobile" ? "max-w-[375px] border-[8px] border-border rounded-[2.5rem] shadow-2xl h-[700px] overflow-hidden bg-background" : "max-w-4xl"}`}>
              {/* THEME-REDESIGN [TB-001]: Background preview inside the mockup frame */}
              <div className="absolute inset-0 -z-10 overflow-hidden rounded-[1.8rem]">
                <ThemeBackground background={workingTheme.background} isDark={activeMode === "dark"} />
              </div>

              {/* THEME-REDESIGN [TB-002]: Realistic UI Preview */}
              <div className="relative space-y-8 p-4 min-h-full">
                {/* Mock Navbar */}
                <Card className="rounded-xl overflow-hidden border-0 shadow-lg">
                  <div className="h-14 bg-background border-b px-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                        <Palette className="h-5 w-5 text-primary-foreground" />
                      </div>
                      <span className="font-bold text-sm tracking-tight">Osiris App</span>
                    </div>
                    <div className="flex gap-3">
                      <div className="h-4 w-12 bg-muted rounded-full" />
                      <div className="h-4 w-12 bg-muted rounded-full" />
                      <div className="h-8 w-8 rounded-full bg-accent" />
                    </div>
                  </div>
                </Card>

                {/* Hero / Stat Section */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { label: "Followers", value: "1.2k", icon: "👥" },
                    { label: "Karma", value: "840", icon: "✨" },
                    { label: "Posts", value: "142", icon: "📝" },
                  ].map((s) => (
                    <Card key={s.label} className="p-4 bg-card border-border shadow-sm">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xl">{s.icon}</span>
                        <Badge variant="secondary" className="text-[10px]">{s.label}</Badge>
                      </div>
                      <p className="text-2xl font-bold text-foreground">{s.value}</p>
                    </Card>
                  ))}
                </div>

                {/* Sample Post Card */}
                <Card className="p-0 border-border shadow-md overflow-hidden bg-card">
                  <div className="p-4 space-y-4">
                    <div className="flex items-center gap-3">
                      <UserAvatar user={{ username: "Designer" }} size="sm" />
                      <div>
                        <p className="text-sm font-bold text-foreground">Creative Lead</p>
                        <p className="text-[10px] text-muted-foreground">2 hours ago</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-base font-bold text-foreground leading-tight">Implementing the new Theme Builder design system!</h3>
                      <p className="text-sm text-foreground/90 leading-relaxed">
                        The two-column layout provides a much better workflow. It's now possible to see every color tweak in real-time without scrolling.
                      </p>
                    </div>
                    <div className="p-2 bg-muted/30 rounded-lg flex gap-2">
                      <Badge className="bg-primary text-primary-foreground">#UX</Badge>
                      <Badge variant="outline" className="border-border">#FrontEnd</Badge>
                    </div>
                    <Separator className="bg-border/50" />
                    <div className="flex items-center justify-between">
                      <div className="flex gap-4">
                        <Button variant="ghost" size="sm" className="h-8 gap-2 text-xs">
                          <span>❤️</span> 24
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 gap-2 text-xs">
                          <span>💬</span> 8
                        </Button>
                      </div>
                      <Button variant="outline" size="sm" className="h-7 text-[10px] px-3">Read More</Button>
                    </div>
                  </div>
                </Card>

                {/* Interactive Elements / Form */}
                <Card className="p-6 bg-card border-border shadow-sm space-y-6">
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold text-foreground">Interactive Elements</h3>
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
                  
                  <div className="p-4 bg-muted/50 rounded-lg border border-border/50 flex items-start gap-3">
                    <Info className="h-4 w-4 text-primary mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-foreground">Pro Tip</p>
                      <p className="text-[10px] text-muted-foreground leading-normal">
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
      <div className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 flex bg-background/80 backdrop-blur-md border shadow-2xl rounded-full p-1 z-50">
        <Button 
          variant={mobileActiveTab === "settings" ? "default" : "ghost"} 
          size="sm" 
          className="rounded-full px-6 h-9 transition-all"
          onClick={() => setMobileActiveTab("settings")}
        >
          Settings
        </Button>
        <Button 
          variant={mobileActiveTab === "preview" ? "default" : "ghost"} 
          size="sm" 
          className="rounded-full px-6 h-9 transition-all"
          onClick={() => setMobileActiveTab("preview")}
        >
          Preview
        </Button>
      </div>
    </div>
  );
}
