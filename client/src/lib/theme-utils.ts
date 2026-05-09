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
  version?: number;
  background?: BackgroundConfig;
}

// --- Background Types ---

export type BackgroundMode = "solid" | "gradient" | "image";

export interface BackgroundImage {
  type: "url" | "fileRef" | "dataRef";
  value: string;
}

export interface BackgroundOverlay {
  opacity: number;  // 0..1
  blur: number;     // 0..24
  tint: string;     // HSL string e.g. "0 0% 0%"
  brightness?: number; // 0..2 (1 is normal)
  contrast?: number;   // 0..2 (1 is normal)
}

export interface BackgroundConfig {
  mode: BackgroundMode;
  gradient?: string;
  image?: BackgroundImage;
  overlay: BackgroundOverlay;
}

export const defaultBackground: BackgroundConfig = {
  mode: "gradient",
  gradient: "linear-gradient(160deg, hsl(230 60% 6%), hsl(270 50% 10%), hsl(200 70% 8%))",
  image: undefined,
  overlay: { opacity: 0.1, blur: 0, tint: "0 0% 0%", brightness: 1, contrast: 1 },
};

// Galaxy gradient presets
export const galaxyGradients = [
  { name: "Nebula", value: "linear-gradient(135deg, hsl(260 80% 10%), hsl(280 60% 20%), hsl(220 70% 15%))" },
  { name: "Deep Space", value: "linear-gradient(160deg, hsl(230 50% 8%), hsl(260 40% 12%), hsl(200 60% 10%))" },
  { name: "Aurora", value: "linear-gradient(135deg, hsl(180 60% 12%), hsl(260 50% 18%), hsl(300 40% 15%))" },
  { name: "Cosmic Dust", value: "linear-gradient(145deg, hsl(270 45% 10%), hsl(330 35% 15%), hsl(200 55% 12%))" },
  { name: "Starfield", value: "linear-gradient(180deg, hsl(220 60% 6%), hsl(240 50% 14%), hsl(260 40% 8%))" },
  { name: "Solar Flare", value: "linear-gradient(135deg, hsl(15 70% 12%), hsl(340 60% 18%), hsl(280 50% 14%))" },
];

// Sanitize a URL string — reject dangerous schemes
function isSafeUrl(url: string): boolean {
  if (!url) return false;
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith("javascript:")) return false;
  if (trimmed.startsWith("data:") && !trimmed.startsWith("data:image/")) return false;
  if (trimmed.startsWith("vbscript:")) return false;
  return true;
}

// Clamp a number within a range
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Migrate legacy themes (no version field) to v2 with background defaults
export function migrateTheme(theme: CustomTheme): CustomTheme {
  if (theme.version === 2) return theme;
  return {
    ...theme,
    version: 2,
    font: theme.font || "Inter",
    background: theme.background ? {
      ...defaultBackground,
      ...theme.background,
      overlay: {
        ...defaultBackground.overlay,
        ...theme.background.overlay,
        opacity: clamp(theme.background.overlay?.opacity ?? 0, 0, 1),
        blur: clamp(theme.background.overlay?.blur ?? 0, 0, 24),
      },
    } : { ...defaultBackground },
  };
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
  font: "Outfit",
  light: {
    background: "230 40% 99%",
    foreground: "230 60% 10%",
    card: "0 0% 100%",
    cardForeground: "230 60% 10%",
    popover: "0 0% 100%",
    popoverForeground: "230 60% 10%",
    primary: "250 100% 65%",
    primaryForeground: "0 0% 100%",
    secondary: "230 30% 97%",
    secondaryForeground: "230 60% 10%",
    muted: "230 30% 97%",
    mutedForeground: "230 20% 45%",
    accent: "250 100% 97%",
    accentForeground: "250 100% 65%",
    destructive: "0 84% 60%",
    destructiveForeground: "0 0% 98%",
    border: "230 30% 94%",
    input: "230 30% 94%",
    ring: "250 100% 65%",
  },
  dark: {
    background: "230 60% 6%",
    foreground: "210 20% 98%",
    card: "230 50% 10%",
    cardForeground: "210 20% 98%",
    popover: "230 50% 10%",
    popoverForeground: "210 20% 98%",
    primary: "270 90% 70%",
    primaryForeground: "230 35% 7%",
    secondary: "230 30% 15%",
    secondaryForeground: "210 20% 98%",
    muted: "230 30% 15%",
    mutedForeground: "215 20% 65%",
    accent: "270 50% 20%",
    accentForeground: "210 20% 98%",
    destructive: "0 80% 50%",
    destructiveForeground: "210 40% 98%",
    border: "230 30% 20%",
    input: "230 30% 15%",
    ring: "270 90% 70%",
  },
};

// Convert HSL string to hex color for color picker
export function hslToHex(hsl: string): string {
  // Handle undefined, null, or empty strings
  if (!hsl || typeof hsl !== "string") {
    return "#000000";
  }

  const parts = hsl.split(" ").map((v) => parseFloat(v));

  // Handle malformed HSL strings (need 3 parts: h, s, l)
  if (parts.length < 3 || parts.some(isNaN)) {
    return "#000000";
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

// Get perceived luminance from HSL string
export function getLuminance(hsl: string): number {
  const hex = hslToHex(hsl);
  const rgb = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!rgb) return 0;
  
  const r = parseInt(rgb[1], 16) / 255;
  const g = parseInt(rgb[2], 16) / 255;
  const b = parseInt(rgb[3], 16) / 255;
  
  // Relative luminance formula
  const a = [r, g, b].map(v => {
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

// Calculate contrast ratio between two HSL colors
export function getContrastRatio(hsl1: string, hsl2: string): number {
  const l1 = getLuminance(hsl1);
  const l2 = getLuminance(hsl2);
  const brighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (brighter + 0.05) / (darker + 0.05);
}

// Generate a random harmonious theme
export function generateRandomTheme(): CustomTheme {
  const baseHue = Math.floor(Math.random() * 360);
  const secondaryHue = (baseHue + 180) % 360;
  
  const light: ThemeColors = {
    background: `${baseHue} 20% 98%`,
    foreground: `${baseHue} 60% 10%`,
    card: "0 0% 100%",
    cardForeground: `${baseHue} 60% 10%`,
    popover: "0 0% 100%",
    popoverForeground: `${baseHue} 60% 10%`,
    primary: `${baseHue} 80% 60%`,
    primaryForeground: "0 0% 98%",
    secondary: `${baseHue} 20% 94%`,
    secondaryForeground: `${baseHue} 60% 20%`,
    muted: `${baseHue} 10% 95%`,
    mutedForeground: `${baseHue} 20% 45%`,
    accent: `${baseHue} 30% 92%`,
    accentForeground: `${baseHue} 80% 50%`,
    destructive: "0 84% 60%",
    destructiveForeground: "0 0% 98%",
    border: `${baseHue} 20% 90%`,
    input: `${baseHue} 20% 90%`,
    ring: `${baseHue} 80% 60%`,
  };

  const dark: ThemeColors = {
    background: `${baseHue} 60% 6%`,
    foreground: `${baseHue} 20% 98%`,
    card: `${baseHue} 50% 10%`,
    cardForeground: `${baseHue} 20% 98%`,
    popover: `${baseHue} 50% 10%`,
    popoverForeground: `${baseHue} 20% 98%`,
    primary: `${baseHue} 90% 70%`,
    primaryForeground: `${baseHue} 35% 7%`,
    secondary: `${baseHue} 30% 15%`,
    secondaryForeground: `${baseHue} 20% 98%`,
    muted: `${baseHue} 30% 15%`,
    mutedForeground: `${baseHue} 20% 65%`,
    accent: `${baseHue} 50% 20%`,
    accentForeground: `${baseHue} 20% 98%`,
    destructive: "0 80% 50%",
    destructiveForeground: "210 40% 98%",
    border: `${baseHue} 30% 20%`,
    input: `${baseHue} 30% 15%`,
    ring: `${baseHue} 90% 70%`,
  };

  return {
    version: 2,
    font: "Outfit",
    light,
    dark,
    background: {
      mode: "gradient",
      gradient: `linear-gradient(135deg, hsl(${baseHue} 60% 10%), hsl(${secondaryHue} 50% 15%))`,
      overlay: { opacity: 0.1, blur: 0, tint: "0 0% 0%" }
    }
  };
}

export function applyFont(fontName: string) {
  if (!fontName) return;

  // Load font from Google Fonts
  const linkId = "custom-theme-font";
  let link = document.querySelector(`#${linkId}`) as HTMLLinkElement;

  if (!link) {
    link = document.createElement("link");
    link.id = linkId;
    link.rel = "stylesheet";
    document.head.append(link);
  }

  link.href = `https://fonts.googleapis.com/css2?family=${fontName.replaceAll(' ', "+")}:wght@300;400;500;600;700&display=swap`;

  // Apply font family
  document.documentElement.style.setProperty(
    "--font-family",
    `'${fontName}', system-ui, -apple-system, sans-serif`,
  );
}

// Apply theme colors to CSS variables
export function applyTheme(colors: ThemeColors, isDark: boolean, font?: string, background?: BackgroundConfig): void {
  const root = document.documentElement;

  Object.entries(colors).forEach(([key, value]) => {
    const cssVarName = `--${key.replaceAll(/([A-Z])/g, "-$1").toLowerCase()}`;
    root.style.setProperty(cssVarName, value);
  });

  // Apply background CSS variables
  const bg = background || defaultBackground;
  root.style.setProperty("--bg-mode", bg.mode);
  root.style.setProperty("--bg-gradient", bg.gradient || "none");
  root.style.setProperty("--bg-overlay-opacity", String(bg.overlay.opacity));
  root.style.setProperty("--bg-overlay-blur", `${bg.overlay.blur}px`);
  root.style.setProperty("--bg-overlay-tint", bg.overlay.tint || "0 0% 0%");

  // Image URL is resolved separately by the ThemeBackground component
  // We only pass the raw value here so the component can read it
  if (bg.image?.value) {
    root.style.setProperty("--bg-image-ref", bg.image.value);
    root.style.setProperty("--bg-image-type", bg.image.type);
  } else {
    root.style.removeProperty("--bg-image-ref");
    root.style.removeProperty("--bg-image-type");
  }

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
    return migrateTheme(theme);
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
    // Migration for older themes
    return themes.map((t: SavedTheme) => ({
      ...t,
      colors: migrateTheme({
        ...t.colors,
        font: t.colors.font || "Inter",
      }),
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
  const existingIndex = themes.findIndex((t) => t.name.trim() === name.trim());
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
// Logic preserved for future use but export removed for Knip
function resetToDefaultTheme(): void {
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
    // Validate basic structure
    if (!theme.light || !theme.dark) return null;

    // Migrate to v2
    const migrated = migrateTheme(theme);

    // Sanitize background image URL if present
    if (migrated.background?.image) {
      if (migrated.background.image.type === "url" && !isSafeUrl(migrated.background.image.value)) {
        migrated.background.image = undefined;
      }
    }

    // Clamp overlay values
    if (migrated.background) {
      migrated.background.overlay.opacity = clamp(migrated.background.overlay.opacity, 0, 1);
      migrated.background.overlay.blur = clamp(migrated.background.overlay.blur, 0, 24);
    }

    return migrated;
  } catch {
    return null;
  }
}
