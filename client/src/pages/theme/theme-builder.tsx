import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useCustomTheme } from "@/hooks/use-custom-theme";
import { ThemeGroup } from "@/components/theme/theme-group";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Palette,
    Type,
    Square,
    MousePointer,
    Download,
    Upload,
    RotateCcw,
    Sparkles,
    Save,
    X,
    FolderOpen,
    Trash2,
    Check,
    Plus
} from "lucide-react";
import { exportTheme, importTheme, loadCustomTheme, defaultTheme, applyTheme, getActiveThemeInfo, setActiveThemeInfo, clearActiveThemeInfo, ACTIVE_THEME_EVENT } from "@/lib/theme-utils";
import { useToast } from "@/hooks/use-toast";
import type { ThemeColors, CustomTheme, SavedTheme } from "@/lib/theme-utils";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { OpenVerseIcon } from "@/components/icons/open-verse-icon";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { availableFonts } from "@/lib/theme-utils";

export default function ThemeBuilderPage() {
    const { t } = useTranslation();
    const [, setLocation] = useLocation();
    const { customTheme, isDark, updateColor, resetTheme, importTheme: importCustomTheme, savedThemes, saveThemeAs, deleteTheme, loadTheme } = useCustomTheme();
    const { toast } = useToast();
    const [activeMode, setActiveMode] = useState<"light" | "dark">("light");
    const [workingTheme, setWorkingTheme] = useState<CustomTheme>(customTheme);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [themeName, setThemeName] = useState("My Custom Theme");
    const [activeThemeId, setActiveThemeId] = useState<string | number | null>(null);
    const [isManageOpen, setIsManageOpen] = useState(false);
    const [unifiedMode, setUnifiedMode] = useState(false);

    // Initialize working theme from stored theme
    useEffect(() => {
        const stored = loadCustomTheme();
        if (stored) {
            setWorkingTheme(stored);
            setUnifiedMode(!!stored.unified);
        } else {
            setWorkingTheme(defaultTheme);
        }

        // Sync with active theme info from dropdown selection
        const activeInfo = getActiveThemeInfo();
        if (activeInfo) {
            setThemeName(activeInfo.name);
            setActiveThemeId(activeInfo.id);
        }
    }, []);

    // Listen for active theme changes (from dropdown)
    useEffect(() => {
        const handleActiveThemeChange = () => {
            const activeInfo = getActiveThemeInfo();
            if (activeInfo) {
                setThemeName(activeInfo.name);
                setActiveThemeId(activeInfo.id);
                setHasUnsavedChanges(false);
            }
        };

        window.addEventListener(ACTIVE_THEME_EVENT, handleActiveThemeChange);
        return () => window.removeEventListener(ACTIVE_THEME_EVENT, handleActiveThemeChange);
    }, []);

    const handleUnifiedModeChange = (checked: boolean) => {
        setUnifiedMode(checked);
        if (checked) {
            // Apply current mode colors to both modes
            const currentColors = workingTheme[activeMode];
            setWorkingTheme(prev => ({
                ...prev,
                light: currentColors,
                dark: currentColors,
                unified: true // Persist setting
            }));
            setHasUnsavedChanges(true);
            toast({
                title: "Unified Mode Enabled",
                description: `Applied ${activeMode} colors to both modes.`
            });
        } else {
            // Include unified: false even when turning off, to persist the choice
            setWorkingTheme(prev => ({ ...prev, unified: false }));
            setHasUnsavedChanges(true);
        }
    };

    // Live Preview: Apply changes immediately to the document
    useEffect(() => {
        const mode = isDark ? "dark" : "light";
        applyTheme(workingTheme[mode], isDark, workingTheme.font);
    }, [workingTheme, isDark]);

    const handleColorChange = (key: keyof ThemeColors, value: string) => {
        setWorkingTheme((prev) => {
            if (unifiedMode) {
                return {
                    ...prev,
                    light: { ...prev.light, [key]: value },
                    dark: { ...prev.dark, [key]: value },
                };
            }
            return {
                ...prev,
                [activeMode]: {
                    ...prev[activeMode],
                    [key]: value,
                },
            };
        });
        setHasUnsavedChanges(true);
    };

    const handleFontChange = (value: string) => {
        setWorkingTheme(prev => ({
            ...prev,
            font: value
        }));
        setHasUnsavedChanges(true);
    };

    const handleSave = async () => {
        try {
            // Apply the working theme globally
            importCustomTheme(workingTheme);

            // Save as named theme
            // Pass workingTheme directly to ensure we save what's on screen!
            const saved = await saveThemeAs(themeName, activeThemeId || undefined, workingTheme);
            setActiveThemeId(saved.id);
            setActiveThemeInfo(saved.id, saved.name); // Update active theme info after save

            setHasUnsavedChanges(false);
            toast({
                title: "Theme saved",
                description: `Theme "${themeName}" has been saved successfully.`,
            });
        } catch (error) {
            console.error('[Theme Builder] Save failed:', error);
            toast({
                title: "Save failed",
                description: error instanceof Error ? error.message : "Failed to save theme. Please try again.",
                variant: "destructive",
            });
        }
    };

    const handleLoadTheme = (theme: SavedTheme) => {
        setWorkingTheme(theme.colors);
        setUnifiedMode(!!theme.colors.unified); // Restore unified setting
        setThemeName(theme.name);
        setActiveThemeId(theme.id);
        setActiveThemeInfo(theme.id, theme.name); // Track active theme
        setHasUnsavedChanges(false); // It's a saved theme
        importCustomTheme(theme.colors); // Apply it
        setIsManageOpen(false);
        toast({
            title: "Theme loaded",
            description: `Loaded "${theme.name}".`,
        });
    };

    const handleDeleteTheme = (id: string | number, e: React.MouseEvent) => {
        e.stopPropagation();
        deleteTheme(id);
        if (activeThemeId === id) {
            setActiveThemeId(null);
        }
        toast({
            title: "Theme deleted",
            description: "The theme has been removed.",
        });
    };

    const handleCreateNew = () => {
        setThemeName("New Theme");
        setActiveThemeId(null);
        clearActiveThemeInfo(); // Clear active theme tracking
        setHasUnsavedChanges(true);
        // Keep current colors or reset? Let's keep current as a base.
        toast({
            title: "New theme started",
            description: "Enter a name and click Save to create.",
        });
    };

    const handleCancel = () => {
        // Reset working theme to the saved theme
        const stored = loadCustomTheme();
        if (stored) {
            setWorkingTheme(stored);
        } else {
            setWorkingTheme(defaultTheme);
        }
        setHasUnsavedChanges(false);
        setLocation("/feed/media");
    };

    const handleExport = () => {
        const json = exportTheme(workingTheme);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "open-verse-custom-theme.json";
        a.click();
        URL.revokeObjectURL(url);
        toast({
            title: "Theme exported",
            description: "Your custom theme has been downloaded.",
        });
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
                try {
                    const theme = importTheme(event.target?.result as string);
                    if (theme) {
                        setWorkingTheme(theme);
                        setHasUnsavedChanges(true);
                        toast({
                            title: "Theme imported",
                            description: "Theme loaded. Click Save to apply changes.",
                        });
                    } else {
                        toast({
                            title: "Import failed",
                            description: "Invalid theme file format.",
                            variant: "destructive",
                        });
                    }
                } catch {
                    toast({
                        title: "Import failed",
                        description: "Could not read theme file.",
                        variant: "destructive",
                    });
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    const handleReset = () => {
        setWorkingTheme(defaultTheme);
        setHasUnsavedChanges(true);
        toast({
            title: "Theme reset",
            description: "Theme reset to defaults. Click Save to apply changes.",
        });
    };

    const currentColors = workingTheme[activeMode];

    return (
        <div className="min-h-screen pb-20">
            {/* Fixed Sub-Header - Now overlaying main navbar */}
            <div className="fixed top-0 left-0 right-0 z-[120] bg-background border-b shadow-sm h-16 flex items-center">
                <div className="container max-w-4xl mx-auto px-4 py-2">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <OpenVerseIcon className="h-6 w-6 text-primary" />
                                <Input
                                    value={themeName}
                                    onChange={(e) => {
                                        setThemeName(e.target.value);
                                        setHasUnsavedChanges(true); // Name change also counts as unsaved
                                    }}
                                    className="h-8 font-bold text-lg border-transparent hover:border-input focus:border-input px-2 w-[200px] sm:w-[300px]"
                                />
                            </div>
                            <div className="flex items-center gap-2 px-2">
                                {hasUnsavedChanges ? (
                                    <p className="text-xs text-yellow-500 font-medium">
                                        ● Unsaved changes
                                    </p>
                                ) : (
                                    <p className="text-xs text-muted-foreground">
                                        All changes saved
                                    </p>
                                )}
                                {activeThemeId && (
                                    <span className="text-xs text-muted-foreground border px-1 rounded bg-muted/50">
                                        Editing
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Dialog open={isManageOpen} onOpenChange={setIsManageOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="sm">
                                        <FolderOpen className="h-4 w-4 mr-1" />
                                        Themes
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>My Saved Themes</DialogTitle>
                                        <DialogDescription>
                                            Manage your custom themes across Osiris.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="max-h-[300px] overflow-y-auto space-y-2 py-4">
                                        {savedThemes.length === 0 ? (
                                            <p className="text-center text-muted-foreground py-8">
                                                No saved themes yet. Save your current design to see it here!
                                            </p>
                                        ) : (
                                            savedThemes.map((theme) => (
                                                <div
                                                    key={theme.id}
                                                    onClick={() => handleLoadTheme(theme)}
                                                    className={`
                                                        flex items-center justify-between p-3 rounded-md border cursor-pointer hover:bg-accent transition-colors
                                                        ${activeThemeId === theme.id ? "border-primary bg-accent/50" : ""}
                                                    `}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            className="w-8 h-8 rounded-full border shadow-sm"
                                                            style={{ background: `hsl(${theme.colors.light.primary})` }}
                                                        />
                                                        <div>
                                                            <p className="font-medium text-sm">{theme.name}</p>
                                                            <p className="text-xs text-muted-foreground">
                                                                {new Date(theme.createdAt).toLocaleDateString()}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        {activeThemeId === theme.id && (
                                                            <Check className="h-4 w-4 text-primary mr-2" />
                                                        )}
                                                        {theme.name !== "Default Blue" && (
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                                                                onClick={(e) => handleDeleteTheme(theme.id, e)}
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                    <DialogFooter>
                                        <Button variant="outline" onClick={handleCreateNew} className="w-full sm:w-auto">
                                            <Plus className="h-4 w-4 mr-2" />
                                            Start New
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>

                            <Button onClick={handleCancel} variant="ghost" size="sm">
                                <X className="h-4 w-4 mr-1" />
                            </Button>
                            <Button onClick={() => handleSave()} disabled={!hasUnsavedChanges && !themeName} size="sm">
                                <Save className="h-4 w-4 mr-1" />
                                Save
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content with top margin to account for fixed header */}
            <div className="container max-w-4xl mx-auto px-4 py-8 mt-16">
                <div className="space-y-6">
                    {/* Description */}
                    <Card>
                        <CardHeader>
                            <CardDescription>
                                Customize every color in Osiris to make it truly yours. Changes are previewed in real-time. Click <strong>Save Changes</strong> to apply your theme.
                            </CardDescription>
                        </CardHeader>
                    </Card>

                    {/* Utility Buttons */}
                    <div className="flex flex-wrap gap-2">
                        <Button onClick={handleReset} variant="outline" size="sm">
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Reset to Default
                        </Button>
                        <Button onClick={handleExport} variant="outline" size="sm">
                            <Download className="h-4 w-4 mr-2" />
                            Export Theme
                        </Button>
                        <Button onClick={handleImport} variant="outline" size="sm">
                            <Upload className="h-4 w-4 mr-2" />
                            Import Theme
                        </Button>
                    </div>

                    {/* Global Settings */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Typography</CardTitle>
                            <CardDescription>Select the font family for the entire application.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center space-x-4">
                                <Label className="w-24">Font Family</Label>
                                <Select value={workingTheme.font || "Inter"} onValueChange={handleFontChange}>
                                    <SelectTrigger className="w-full sm:w-[300px]">
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
                        </CardContent>
                    </Card>

                    {/* Mode Tabs */}
                    <Tabs value={activeMode} onValueChange={(v) => setActiveMode(v as "light" | "dark")}>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="unified-mode"
                                    checked={unifiedMode}
                                    onCheckedChange={handleUnifiedModeChange}
                                />
                                <Label htmlFor="unified-mode">Unified Colors (Same for Light/Dark)</Label>
                            </div>
                        </div>

                        {!unifiedMode && (
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="light">☀️ Light Mode</TabsTrigger>
                                <TabsTrigger value="dark">🌙 Dark Mode</TabsTrigger>
                            </TabsList>
                        )}

                        <TabsContent value={activeMode} className="space-y-6 mt-6">
                            {/* Color Sections */}
                            <div className="grid gap-4">
                                {/* Backgrounds Section */}
                                <ThemeGroup
                                    title="Backgrounds"
                                    icon={<Square className="h-5 w-5" />}
                                    colors={currentColors}
                                    colorKeys={["background", "card", "popover"]}
                                    onColorChange={handleColorChange}
                                />

                                {/* Text Colors Section */}
                                <ThemeGroup
                                    title="Text Colors"
                                    icon={<Type className="h-5 w-5" />}
                                    colors={currentColors}
                                    colorKeys={["foreground", "cardForeground", "popoverForeground", "mutedForeground"]}
                                    onColorChange={handleColorChange}
                                />

                                {/* Interactive Elements Section */}
                                <ThemeGroup
                                    title="Buttons & Interactive"
                                    icon={<MousePointer className="h-5 w-5" />}
                                    colors={currentColors}
                                    colorKeys={[
                                        "primary",
                                        "primaryForeground",
                                        "secondary",
                                        "secondaryForeground",
                                        "destructive",
                                        "destructiveForeground",
                                    ]}
                                    onColorChange={handleColorChange}
                                />

                                {/* Accents & Borders Section */}
                                <ThemeGroup
                                    title="Accents & Borders"
                                    icon={<Sparkles className="h-5 w-5" />}
                                    colors={currentColors}
                                    colorKeys={[
                                        "accent",
                                        "accentForeground",
                                        "muted",
                                        "border",
                                        "input",
                                        "ring",
                                    ]}
                                    onColorChange={handleColorChange}
                                />
                            </div>

                            {/* Preview Card */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Preview</CardTitle>
                                    <CardDescription>
                                        See how your theme changes will look (Save to apply across the app)
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex flex-wrap gap-2">
                                        <Button size="sm">Primary Button</Button>
                                        <Button size="sm" variant="secondary">Secondary</Button>
                                        <Button size="sm" variant="destructive">Destructive</Button>
                                        <Button size="sm" variant="outline">Outline</Button>
                                    </div>
                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="text-base">Sample Card</CardTitle>
                                            <CardDescription>This is how cards will look</CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <p className="text-sm">
                                                Regular text in your theme
                                            </p>
                                            <p className="text-sm text-muted-foreground mt-2">
                                                Muted text for secondary information
                                            </p>
                                        </CardContent>
                                    </Card>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
        </div>
    );
}
