// Theme utility functions for custom theme builder
export const CUSTOM_THEME_EVENT = "custom-theme-changed";

export interface ThemeColors {
    background: string;
    foreground: string;
    card: string;
    cardForeground: string;
    popover: string;
    popoverForeground: string;
    primary: string;
    primaryForeground: string;
    secondary: string;
    secondaryForeground: string;
    muted: string;
    mutedForeground: string;
    accent: string;
    accentForeground: string;
    destructive: string;
    destructiveForeground: string;
    border: string;
    input: string;
    ring: string;
}

export interface CustomTheme {
    light: ThemeColors;
    dark: ThemeColors;
}

// Default theme based on current Open Verse blue theme
export const defaultTheme: CustomTheme = {
    light: {
        background: "0 0% 100%",
        foreground: "222 47% 11%",
        card: "0 0% 100%",
        cardForeground: "222 47% 11%",
        popover: "0 0% 100%",
        popoverForeground: "222 47% 11%",
        primary: "215 70% 50%",
        primaryForeground: "0 0% 98%",
        secondary: "210 40% 96%",
        secondaryForeground: "222 47% 11%",
        muted: "210 40% 96%",
        mutedForeground: "215 16% 47%",
        accent: "210 40% 96%",
        accentForeground: "222 47% 11%",
        destructive: "0 84% 60%",
        destructiveForeground: "0 0% 98%",
        border: "214 32% 91%",
        input: "214 32% 91%",
        ring: "215 70% 50%",
    },
    dark: {
        background: "222 47% 11%",
        foreground: "210 40% 98%",
        card: "222 47% 11%",
        cardForeground: "210 40% 98%",
        popover: "222 47% 11%",
        popoverForeground: "210 40% 98%",
        primary: "217 91% 60%",
        primaryForeground: "222 47% 11%",
        secondary: "217 33% 17%",
        secondaryForeground: "210 40% 98%",
        muted: "217 33% 17%",
        mutedForeground: "215 20% 65%",
        accent: "217 33% 17%",
        accentForeground: "210 40% 98%",
        destructive: "0 62% 30%",
        destructiveForeground: "210 40% 98%",
        border: "217 33% 17%",
        input: "217 33% 17%",
        ring: "217 91% 60%",
    },
};

// Convert HSL string to hex color for color picker
export function hslToHex(hsl: string): string {
    const [h, s, l] = hsl.split(" ").map((v) => parseFloat(v));
    const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
    const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const color = l / 100 - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color)
            .toString(16)
            .padStart(2, "0");
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

// Convert hex color to HSL string for CSS variables
export function hexToHsl(hex: string): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return "0 0% 0%";

    const r = parseInt(result[1], 16) / 255;
    const g = parseInt(result[2], 16) / 255;
    const b = parseInt(result[3], 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
            case r:
                h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
                break;
            case g:
                h = ((b - r) / d + 2) / 6;
                break;
            case b:
                h = ((r - g) / d + 4) / 6;
                break;
        }
    }

    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// Apply theme colors to CSS variables
export function applyTheme(colors: ThemeColors, isDark: boolean): void {
    const root = document.documentElement;
    const prefix = isDark ? "" : ""; // Same root for both modes

    Object.entries(colors).forEach(([key, value]) => {
        const cssVarName = `--${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
        root.style.setProperty(cssVarName, value);
    });
}

// Saved Theme Interface
// Saved Theme Interface
export interface SavedTheme {
    id: string | number;
    name: string;
    colors: CustomTheme;
    createdAt: number | string | Date;
}

// Save custom theme to localStorage (legacy)
export function saveCustomTheme(theme: CustomTheme): void {
    localStorage.setItem("customTheme", JSON.stringify(theme));
    window.dispatchEvent(new Event(CUSTOM_THEME_EVENT));
}

// Load custom theme from localStorage
export function loadCustomTheme(): CustomTheme | null {
    const stored = localStorage.getItem("customTheme");
    if (!stored) return null;
    try {
        return JSON.parse(stored);
    } catch {
        return null;
    }
}

// --- Named Themes Management ---

export const SAVED_THEMES_KEY = "nexus-saved-themes";
export const SAVED_THEMES_EVENT = "saved-themes-changed";

// Get all saved themes
export function getSavedThemes(): SavedTheme[] {
    const stored = localStorage.getItem(SAVED_THEMES_KEY);
    if (!stored) return [];
    try {
        return JSON.parse(stored);
    } catch {
        return [];
    }
}

// Save a new theme or update existing
export function saveNamedTheme(name: string, colors: CustomTheme, id?: string): SavedTheme {
    const themes = getSavedThemes();
    const newTheme: SavedTheme = {
        id: id || crypto.randomUUID(),
        name,
        colors,
        createdAt: id ? (themes.find((t) => t.id === id)?.createdAt || Date.now()) : Date.now(),
    };

    if (id) {
        const index = themes.findIndex((t) => t.id === id);
        if (index !== -1) {
            themes[index] = newTheme;
        } else {
            themes.push(newTheme);
        }
    } else {
        themes.push(newTheme);
    }

    localStorage.setItem(SAVED_THEMES_KEY, JSON.stringify(themes));
    window.dispatchEvent(new Event(SAVED_THEMES_EVENT));
    return newTheme;
}

// Delete a saved theme
export function deleteNamedTheme(id: string): void {
    const themes = getSavedThemes().filter((t) => t.id !== id);
    localStorage.setItem(SAVED_THEMES_KEY, JSON.stringify(themes));
    window.dispatchEvent(new Event(SAVED_THEMES_EVENT));
}

// Load a saved theme as active
export function applySavedTheme(theme: SavedTheme): void {
    saveCustomTheme(theme.colors);
}

// Reset to default theme
export function resetToDefaultTheme(): void {
    localStorage.removeItem("customTheme");
    const isDark = document.documentElement.classList.contains("dark");
    applyTheme(defaultTheme[isDark ? "dark" : "light"], isDark);
    window.dispatchEvent(new Event(CUSTOM_THEME_EVENT));
}

// Export theme as JSON
export function exportTheme(theme: CustomTheme): string {
    return JSON.stringify(theme, null, 2);
}

// Import theme from JSON
export function importTheme(jsonString: string): CustomTheme | null {
    try {
        const theme = JSON.parse(jsonString);
        // Validate structure
        if (theme.light && theme.dark) {
            return theme as CustomTheme;
        }
        return null;
    } catch {
        return null;
    }
}
