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
    font?: string;
    unified?: boolean;
}

// Available fonts with their Google Fonts family names
export const availableFonts = [
    { name: "Inter", family: "Inter" },
    { name: "Roboto", family: "Roboto" },
    { name: "Open Sans", family: "Open Sans" },
    { name: "Lato", family: "Lato" },
    { name: "Poppins", family: "Poppins" },
    { name: "Montserrat", family: "Montserrat" },
    { name: "Raleway", family: "Raleway" },
    { name: "Ubuntu", family: "Ubuntu" },
    { name: "Nunito", family: "Nunito" },
    { name: "Rubik", family: "Rubik" },
    { name: "Work Sans", family: "Work Sans" },
    { name: "Quicksand", family: "Quicksand" },
    { name: "Space Grotesk", family: "Space Grotesk" },
    { name: "Playfair Display", family: "Playfair Display" },
    { name: "Merriweather", family: "Merriweather" },
    { name: "Lora", family: "Lora" },
    { name: "PT Serif", family: "PT Serif" },
    { name: "Bitter", family: "Bitter" },
    { name: "Courier Prime", family: "Courier Prime" },
    { name: "Fira Code", family: "Fira Code" },
    { name: "JetBrains Mono", family: "JetBrains Mono" },
    { name: "Outfit", family: "Outfit" },
    { name: "Manrope", family: "Manrope" },
    { name: "DM Sans", family: "DM Sans" },
    { name: "Cabin", family: "Cabin" },
];

// Default theme based on current Osiris blue theme
export const defaultTheme: CustomTheme = {
    font: "Inter",
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
    // Handle undefined, null, or empty strings
    if (!hsl || typeof hsl !== 'string') {
        return '#000000';
    }

    const parts = hsl.split(" ").map((v) => parseFloat(v));

    // Handle malformed HSL strings (need 3 parts: h, s, l)
    if (parts.length < 3 || parts.some(isNaN)) {
        return '#000000';
    }

    const [h, s, l] = parts;
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

export function applyFont(fontName: string) {
    if (!fontName) return;

    // Load font from Google Fonts
    const linkId = 'custom-theme-font';
    let link = document.getElementById(linkId) as HTMLLinkElement;

    if (!link) {
        link = document.createElement('link');
        link.id = linkId;
        link.rel = 'stylesheet';
        document.head.appendChild(link);
    }

    link.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/ /g, '+')}:wght@300;400;500;600;700&display=swap`;

    // Apply font family
    document.documentElement.style.setProperty('--font-family', `'${fontName}', system-ui, -apple-system, sans-serif`);
}

// Apply theme colors to CSS variables
export function applyTheme(colors: ThemeColors, isDark: boolean, font?: string): void {
    const root = document.documentElement;

    Object.entries(colors).forEach(([key, value]) => {
        const cssVarName = `--${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
        root.style.setProperty(cssVarName, value);
    });

    if (font) {
        applyFont(font);
    }
}

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
        const theme = JSON.parse(stored);
        // Ensure font is present if missing from legacy themes
        if (!theme.font) theme.font = "Inter";
        return theme;
    } catch {
        return null;
    }
}

// --- Named Themes Management ---

export const SAVED_THEMES_KEY = "nexus-saved-themes";
export const SAVED_THEMES_EVENT = "saved-themes-changed";
export const ACTIVE_THEME_KEY = "activeThemeInfo";
export const ACTIVE_THEME_EVENT = "activeThemeChanged";

// Get all saved themes
export function getSavedThemes(): SavedTheme[] {
    const stored = localStorage.getItem(SAVED_THEMES_KEY);
    if (!stored) return [];
    try {
        const themes = JSON.parse(stored);
        // Migration for older themes without font
        return themes.map((t: SavedTheme) => ({
            ...t,
            colors: {
                ...t.colors,
                font: t.colors.font || "Inter"
            }
        }));
    } catch {
        return [];
    }
}

// Save a new theme or update existing
export function saveNamedTheme(name: string, colors: CustomTheme, id?: string): SavedTheme {
    const themes = getSavedThemes();

    // 1. If ID is provided, we intend to update a specific theme instance
    if (id) {
        const index = themes.findIndex((t) => t.id === id);
        if (index !== -1) {
            themes[index] = {
                ...themes[index],
                name,
                colors,
                // keep original createdAt
            };
            localStorage.setItem(SAVED_THEMES_KEY, JSON.stringify(themes));
            window.dispatchEvent(new Event(SAVED_THEMES_EVENT));
            return themes[index];
        }
    }

    // 2. Name collision check (only if no ID or ID not found)
    // Use case: User types a name that already exists and clicks save
    const existingIndex = themes.findIndex(t => t.name.trim() === name.trim());
    if (existingIndex !== -1) {
        // Overwrite existing theme
        themes[existingIndex] = {
            ...themes[existingIndex],
            colors,
            // keep original id and createdAt
        };
        localStorage.setItem(SAVED_THEMES_KEY, JSON.stringify(themes));
        window.dispatchEvent(new Event(SAVED_THEMES_EVENT));
        return themes[existingIndex];
    }

    // 3. Create new
    const newTheme: SavedTheme = {
        id: crypto.randomUUID(),
        name: name.trim(),
        colors,
        createdAt: Date.now(),
    };

    themes.push(newTheme);

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

// Get active theme info
export function getActiveThemeInfo(): { id: string | number; name: string } | null {
    const stored = localStorage.getItem(ACTIVE_THEME_KEY);
    if (!stored) return null;
    try {
        return JSON.parse(stored);
    } catch {
        return null;
    }
}

// Set active theme info
export function setActiveThemeInfo(id: string | number, name: string): void {
    localStorage.setItem(ACTIVE_THEME_KEY, JSON.stringify({ id, name }));
    window.dispatchEvent(new Event(ACTIVE_THEME_EVENT));
}

// Clear active theme info
export function clearActiveThemeInfo(): void {
    localStorage.removeItem(ACTIVE_THEME_KEY);
    window.dispatchEvent(new Event(ACTIVE_THEME_EVENT));
}

// Load a saved theme as active
export function applySavedTheme(theme: SavedTheme): void {
    saveCustomTheme(theme.colors);
    setActiveThemeInfo(theme.id, theme.name);
}

// Reset to default theme
export function resetToDefaultTheme(): void {
    localStorage.removeItem("customTheme");
    const isDark = document.documentElement.classList.contains("dark");
    applyTheme(defaultTheme[isDark ? "dark" : "light"], isDark, defaultTheme.font);
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
            if (!theme.font) theme.font = "Inter";
            return theme as CustomTheme;
        }
        return null;
    } catch {
        return null;
    }
}
