// Theme utility functions for custom theme builder
export const CUSTOM_THEME_EVENT = "custom-theme-changed";
export const THEME_VERSION = 3;

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
  /** Warm highlight for badges, markers and single stars. */
  star?: string;
}

export interface ParticleConfig {
  coreColor: string;   // hex e.g. "#c8d2ff"
  glowColor: string;   // hex e.g. "#8496ff"
  enabled: boolean;
  speed?: number;
  attraction?: number;
  size?: number;
  glowStrength?: number;
  twinkle?: boolean;
}

export type ShapeStyle = "fase" | "kante" | "rund";
export type AvatarShape = "achteck" | "quadrat" | "kreis";
export type SurfaceMode = "panel" | "glas" | "kontur";

export interface ShapeConfig {
  style: ShapeStyle;
  /** Corner size in px: the chamfer cut for "fase", the radius for "rund". */
  size: number;
  avatar: AvatarShape;
}

export interface SurfaceConfig {
  mode: SurfaceMode;
  opacity: number; // 0..1
  blur: number;    // 0..24 px
}

export interface FontConfig {
  display: string;
  body: string;
  data: string;
}

export interface GalaxyConfig {
  stars: boolean;
  grid: boolean;
  constellation: boolean;
  grain: number; // 0..0.3
}

export interface CustomTheme {
  light: ThemeColors;
  dark: ThemeColors;
  /** Legacy single font (v2); v3 themes use `fonts`. */
  font?: string;
  unified?: boolean;
  version?: number;
  background?: BackgroundConfig;
  particles?: ParticleConfig;
  shape?: ShapeConfig;
  surface?: SurfaceConfig;
  fonts?: FontConfig;
  galaxy?: GalaxyConfig;
}

export const defaultParticles: Required<ParticleConfig> = {
  coreColor: "#c8d2ff",
  glowColor: "#8496ff",
  enabled: true,
  speed: 1,
  attraction: 0.008,
  size: 1,
  glowStrength: 1,
  twinkle: true,
};

export const defaultShape: ShapeConfig = { style: "fase", size: 10, avatar: "achteck" };
export const defaultSurface: SurfaceConfig = { mode: "panel", opacity: 0.9, blur: 0 };
export const defaultFonts: FontConfig = { display: "Chakra Petch", body: "Instrument Sans", data: "JetBrains Mono" };
export const defaultGalaxy: GalaxyConfig = { stars: true, grid: true, constellation: true, grain: 0.06 };

const SHAPE_STYLES: ShapeStyle[] = ["fase", "kante", "rund"];
const AVATAR_SHAPES: AvatarShape[] = ["achteck", "quadrat", "kreis"];
const SURFACE_MODES: SurfaceMode[] = ["panel", "glas", "kontur"];

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

const LEGACY_DEFAULT_GRADIENT = "linear-gradient(160deg, hsl(230 60% 6%), hsl(270 50% 10%), hsl(200 70% 8%))";

export const defaultBackground: BackgroundConfig = {
  mode: "gradient",
  gradient: "linear-gradient(160deg, hsl(230 56% 6%), hsl(252 50% 10%) 55%, hsl(212 60% 7%))",
  image: undefined,
  overlay: { opacity: 0, blur: 0, tint: "0 0% 0%", brightness: 1, contrast: 1 },
};

export const defaultLightBackground: BackgroundConfig = {
  mode: "solid",
  image: undefined,
  overlay: { opacity: 0, blur: 0, tint: "0 0% 100%", brightness: 1, contrast: 1 },
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

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

// Font names end up in a Google Fonts URL and a CSS font-family value, so only plain family names are accepted.
function safeFontName(value: unknown, fallback: string): string {
  return typeof value === "string" && /^[A-Za-z0-9 ]{1,60}$/.test(value.trim()) ? value.trim() : fallback;
}

export function normalizeShape(shape?: Partial<ShapeConfig>): ShapeConfig {
  return {
    style: SHAPE_STYLES.includes(shape?.style as ShapeStyle) ? (shape!.style as ShapeStyle) : defaultShape.style,
    size: Math.round(clamp(finiteOr(shape?.size, defaultShape.size), 0, 24)),
    avatar: AVATAR_SHAPES.includes(shape?.avatar as AvatarShape) ? (shape!.avatar as AvatarShape) : defaultShape.avatar,
  };
}

export function normalizeSurface(surface?: Partial<SurfaceConfig>): SurfaceConfig {
  return {
    mode: SURFACE_MODES.includes(surface?.mode as SurfaceMode) ? (surface!.mode as SurfaceMode) : defaultSurface.mode,
    opacity: clamp(finiteOr(surface?.opacity, defaultSurface.opacity), 0, 1),
    blur: clamp(finiteOr(surface?.blur, defaultSurface.blur), 0, 24),
  };
}

export function normalizeFonts(fonts?: Partial<FontConfig>, legacyFont?: string): FontConfig {
  const legacy = legacyFont ? safeFontName(legacyFont, "") : "";
  return {
    display: safeFontName(fonts?.display, legacy || defaultFonts.display),
    body: safeFontName(fonts?.body, legacy || defaultFonts.body),
    data: safeFontName(fonts?.data, defaultFonts.data),
  };
}

export function normalizeGalaxy(galaxy?: Partial<GalaxyConfig>): GalaxyConfig {
  return {
    stars: typeof galaxy?.stars === "boolean" ? galaxy.stars : defaultGalaxy.stars,
    grid: typeof galaxy?.grid === "boolean" ? galaxy.grid : defaultGalaxy.grid,
    constellation: typeof galaxy?.constellation === "boolean" ? galaxy.constellation : defaultGalaxy.constellation,
    grain: clamp(finiteOr(galaxy?.grain, defaultGalaxy.grain), 0, 0.3),
  };
}

// The v2 default palette. Themes still using it untouched get the new default palette on migration;
// every customised palette is kept as it is.
const LEGACY_V2_DARK: ThemeColors = {
  background: "230 60% 6%", foreground: "210 20% 98%", card: "230 50% 10%", cardForeground: "210 20% 98%",
  popover: "230 50% 10%", popoverForeground: "210 20% 98%", primary: "270 90% 70%", primaryForeground: "230 35% 7%",
  secondary: "230 30% 15%", secondaryForeground: "210 20% 98%", muted: "230 30% 15%", mutedForeground: "215 20% 65%",
  accent: "270 50% 20%", accentForeground: "210 20% 98%", destructive: "0 80% 50%", destructiveForeground: "210 40% 98%",
  border: "230 30% 20%", input: "230 30% 15%", ring: "270 90% 70%",
};

function isLegacyDefaultPalette(theme: CustomTheme): boolean {
  if (!theme.dark) return true;
  return (Object.keys(LEGACY_V2_DARK) as (keyof ThemeColors)[]).every((key) => theme.dark[key] === LEGACY_V2_DARK[key]);
}

function normalizeBackground(background: BackgroundConfig | undefined, legacyPalette: boolean): BackgroundConfig {
  if (!background) return { ...defaultBackground, overlay: { ...defaultBackground.overlay } };
  const gradient = legacyPalette && background.gradient === LEGACY_DEFAULT_GRADIENT ? defaultBackground.gradient : background.gradient;
  return {
    ...defaultBackground,
    ...background,
    gradient,
    overlay: {
      ...defaultBackground.overlay,
      ...background.overlay,
      opacity: clamp(finiteOr(background.overlay?.opacity, 0), 0, 1),
      blur: clamp(finiteOr(background.overlay?.blur, 0), 0, 24),
    },
  };
}

/** Brings any stored, imported or server theme up to the current version. Safe to call repeatedly. */
export function migrateTheme(theme: CustomTheme): CustomTheme {
  const legacyPalette = (theme.version ?? 0) < THEME_VERSION && isLegacyDefaultPalette(theme);
  const legacyFont = !theme.fonts && theme.font && !["Outfit", "Inter"].includes(theme.font) ? theme.font : undefined;
  const light = legacyPalette || !theme.light ? defaultTheme.light : theme.light;
  const dark = legacyPalette || !theme.dark ? defaultTheme.dark : theme.dark;
  const fonts = normalizeFonts(theme.fonts, legacyFont);

  return {
    ...theme,
    version: THEME_VERSION,
    light: { ...light, star: light.star ?? defaultTheme.light.star },
    dark: { ...dark, star: dark.star ?? defaultTheme.dark.star },
    font: fonts.body,
    background: normalizeBackground(theme.background, legacyPalette),
    particles: { ...defaultParticles, ...theme.particles },
    shape: normalizeShape(theme.shape),
    surface: normalizeSurface(theme.surface),
    fonts,
    galaxy: normalizeGalaxy(theme.galaxy),
  };
}

// Available fonts with their Google Fonts family names
export const availableFonts = [
  { name: "Chakra Petch", family: "Chakra Petch" },
  { name: "Instrument Sans", family: "Instrument Sans" },
  { name: "Oxanium", family: "Oxanium" },
  { name: "Saira", family: "Saira" },
  { name: "Archivo", family: "Archivo" },
  { name: "IBM Plex Sans", family: "IBM Plex Sans" },
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

// Fonts offered for numbers, timestamps and small labels.
export const dataFonts = [
  { name: "JetBrains Mono", family: "JetBrains Mono" },
  { name: "IBM Plex Mono", family: "IBM Plex Mono" },
  { name: "Fira Code", family: "Fira Code" },
  { name: "Space Mono", family: "Space Mono" },
  { name: "Courier Prime", family: "Courier Prime" },
];

// Default "Sternkarte" theme: Nachthimmel (dark) and Tageslicht (light).
export const defaultTheme: CustomTheme = {
  version: THEME_VERSION,
  font: defaultFonts.body,
  light: {
    background: "228 30% 96%",
    foreground: "232 40% 12%",
    card: "0 0% 100%",
    cardForeground: "232 40% 12%",
    popover: "0 0% 100%",
    popoverForeground: "232 40% 12%",
    primary: "262 70% 52%",
    primaryForeground: "0 0% 100%",
    secondary: "228 30% 92%",
    secondaryForeground: "232 40% 12%",
    muted: "228 30% 93%",
    mutedForeground: "232 15% 38%",
    accent: "262 80% 95%",
    accentForeground: "262 70% 40%",
    destructive: "0 72% 48%",
    destructiveForeground: "0 0% 100%",
    border: "228 22% 82%",
    input: "228 22% 84%",
    ring: "262 70% 52%",
    star: "30 90% 32%",
  },
  dark: {
    background: "230 56% 6%",
    foreground: "231 58% 95%",
    card: "233 51% 14%",
    cardForeground: "231 58% 95%",
    popover: "233 48% 12%",
    popoverForeground: "231 58% 95%",
    primary: "264 100% 74%",
    primaryForeground: "250 56% 8%",
    secondary: "233 40% 18%",
    secondaryForeground: "231 58% 95%",
    muted: "233 40% 16%",
    mutedForeground: "233 32% 75%",
    accent: "264 45% 22%",
    accentForeground: "231 58% 95%",
    destructive: "0 72% 55%",
    destructiveForeground: "0 0% 100%",
    border: "232 39% 27%",
    input: "232 39% 24%",
    ring: "264 100% 74%",
    star: "38 100% 74%",
  },
  background: defaultBackground,
  particles: defaultParticles,
  shape: defaultShape,
  surface: defaultSurface,
  fonts: defaultFonts,
  galaxy: defaultGalaxy,
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
    star: `${(baseHue + 40) % 360} 85% 32%`,
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
    star: `${(baseHue + 40) % 360} 95% 72%`,
  };

  return {
    version: THEME_VERSION,
    font: defaultFonts.body,
    light,
    dark,
    background: {
      mode: "gradient",
      gradient: `linear-gradient(135deg, hsl(${baseHue} 60% 10%), hsl(${secondaryHue} 50% 15%))`,
      overlay: { opacity: 0.1, blur: 0, tint: "0 0% 0%" }
    }
  };
}

const FONT_WEIGHTS = "400;500;600;700";

// One stylesheet per family. Families that lack one of the weights make Google reject the whole request,
// so a failed load retries with the family's default weight only.
function loadFontFamily(family: string): void {
  const name = safeFontName(family, "");
  if (!name) return;
  const existing = document.querySelector(`link[data-ov-font="${name}"]`);
  if (existing) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.dataset.ovFont = name;
  const familyParam = name.replaceAll(" ", "+");
  link.href = `https://fonts.googleapis.com/css2?family=${familyParam}:wght@${FONT_WEIGHTS}&display=swap`;
  link.addEventListener("error", () => {
    link.href = `https://fonts.googleapis.com/css2?family=${familyParam}&display=swap`;
  }, { once: true });
  document.head.append(link);
}

export function applyFont(fontName: string) {
  if (!fontName) return;
  loadFontFamily(fontName);
  document.documentElement.style.setProperty("--font-family", `"${safeFontName(fontName, defaultFonts.body)}", system-ui, -apple-system, sans-serif`);
}

type DesignSettings = Pick<CustomTheme, "shape" | "surface" | "fonts" | "galaxy" | "font">;

/** Applies shape, surface, font roles and galaxy layers as CSS variables and data attributes on <html>. */
export function applyDesign(design: DesignSettings): void {
  const root = document.documentElement;
  const shape = normalizeShape(design.shape);
  const surface = normalizeSurface(design.surface);
  const fonts = normalizeFonts(design.fonts, design.fonts ? undefined : design.font);
  const galaxy = normalizeGalaxy(design.galaxy);

  root.dataset.shape = shape.style;
  root.dataset.avatar = shape.avatar;
  root.dataset.surface = surface.mode;
  root.dataset.stars = galaxy.stars ? "on" : "off";
  root.dataset.grid = galaxy.grid ? "on" : "off";
  root.dataset.constellation = galaxy.constellation ? "on" : "off";

  const size = shape.size;
  const radii = shape.style === "rund"
    ? { xs: Math.max(2, Math.round(size * 0.4)), sm: Math.max(3, Math.round(size * 0.6)), md: size, lg: Math.round(size * 1.4), pill: 9999 }
    : { xs: 2, sm: 2, md: 2, lg: 2, pill: 2 };
  root.style.setProperty("--radius-xs", `${radii.xs}px`);
  root.style.setProperty("--radius-sm", `${radii.sm}px`);
  root.style.setProperty("--radius-md", `${radii.md}px`);
  root.style.setProperty("--radius-lg", `${radii.lg}px`);
  root.style.setProperty("--radius-pill", `${radii.pill}px`);
  root.style.setProperty("--radius", `${radii.md}px`);
  root.style.setProperty("--cut", `${shape.style === "fase" ? size : 0}px`);
  root.style.setProperty("--cut-sm", `${shape.style === "fase" ? Math.max(4, Math.round(size * 0.6)) : 0}px`);

  const blur = surface.mode === "glas" ? Math.max(surface.blur, 12) : surface.blur;
  // Blur only when requested: backdrop-filter turns every panel into a containing block for fixed children.
  root.dataset.blur = blur > 0 ? "on" : "off";
  root.style.setProperty("--surface-opacity", String(surface.mode === "kontur" ? 0 : surface.opacity));
  root.style.setProperty("--surface-blur", `${blur}px`);
  root.style.setProperty("--grain", String(galaxy.grain));

  [fonts.display, fonts.body, fonts.data].forEach(loadFontFamily);
  root.style.setProperty("--font-display", `"${fonts.display}", "Arial Narrow", system-ui, sans-serif`);
  root.style.setProperty("--font-body", `"${fonts.body}", system-ui, -apple-system, sans-serif`);
  root.style.setProperty("--font-data", `"${fonts.data}", ui-monospace, SFMono-Regular, Menlo, monospace`);
  root.style.setProperty("--font-family", `"${fonts.body}", system-ui, -apple-system, sans-serif`);
}

// Apply theme colors to CSS variables
export function applyTheme(colors: ThemeColors, isDark: boolean, font?: string, background?: BackgroundConfig, design?: DesignSettings): void {
  const root = document.documentElement;

  Object.entries(colors).forEach(([key, value]) => {
    const cssVarName = `--${key.replaceAll(/([A-Z])/g, "-$1").toLowerCase()}`;
    root.style.setProperty(cssVarName, value);
  });

  // Apply background CSS variables
  const bg = background || (isDark ? defaultBackground : defaultLightBackground);
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

  if (design) {
    applyDesign({ ...design, font: design.font ?? font });
  } else if (font) {
    applyFont(font);
  }
}

// Apply particle CSS variables to document root
export function applyParticleConfig(particles?: ParticleConfig): void {
  const p = particles || defaultParticles;
  const root = document.documentElement;
  root.style.setProperty("--particle-core",         p.coreColor);
  root.style.setProperty("--particle-glow",         p.glowColor);
  root.style.setProperty("--particle-enabled",      p.enabled      ? "1" : "0");
  root.style.setProperty("--particle-speed",        String(p.speed         ?? 1));
  root.style.setProperty("--particle-attraction",   String(p.attraction    ?? 0.008));
  root.style.setProperty("--particle-size",         String(p.size          ?? 1));
  root.style.setProperty("--particle-glow-strength",String(p.glowStrength  ?? 1));
  root.style.setProperty("--particle-twinkle",      (p.twinkle ?? true) ? "1" : "0");
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
