import { test } from "node:test";
import assert from "node:assert/strict";
import {
  THEME_VERSION,
  defaultTheme,
  defaultBackground,
  defaultShape,
  defaultSurface,
  defaultFonts,
  defaultGalaxy,
  migrateTheme,
  importTheme,
  exportTheme,
  normalizeShape,
  normalizeSurface,
  normalizeFonts,
  normalizeGalaxy,
  type CustomTheme,
  type ThemeColors,
} from "../../client/src/lib/theme-utils";

// The v2 default dark palette, as it was stored by older clients.
const V2_DARK: ThemeColors = {
  background: "230 60% 6%", foreground: "210 20% 98%", card: "230 50% 10%", cardForeground: "210 20% 98%",
  popover: "230 50% 10%", popoverForeground: "210 20% 98%", primary: "270 90% 70%", primaryForeground: "230 35% 7%",
  secondary: "230 30% 15%", secondaryForeground: "210 20% 98%", muted: "230 30% 15%", mutedForeground: "215 20% 65%",
  accent: "270 50% 20%", accentForeground: "210 20% 98%", destructive: "0 80% 50%", destructiveForeground: "210 40% 98%",
  border: "230 30% 20%", input: "230 30% 15%", ring: "270 90% 70%",
};
const V2_GRADIENT = "linear-gradient(160deg, hsl(230 60% 6%), hsl(270 50% 10%), hsl(200 70% 8%))";

function v2Theme(overrides: Partial<CustomTheme> = {}): CustomTheme {
  return {
    version: 2,
    light: { ...V2_DARK, background: "0 0% 100%", foreground: "230 35% 7%" },
    dark: { ...V2_DARK },
    font: "Outfit",
    background: {
      mode: "gradient",
      solidColor: "230 60% 6%",
      gradient: V2_GRADIENT,
      overlay: { enabled: true, color: "230 60% 6%", opacity: 0.4, blur: 0 },
    },
    ...overrides,
  } as CustomTheme;
}

test("untouched v2 default palette moves to the new default palette", () => {
  const migrated = migrateTheme(v2Theme());
  assert.equal(migrated.version, THEME_VERSION);
  assert.deepEqual(migrated.dark, defaultTheme.dark);
  assert.deepEqual(migrated.light, defaultTheme.light);
  assert.equal(migrated.background?.gradient, defaultBackground.gradient);
});

test("customised v2 palette is kept and only gains the star colour", () => {
  const dark = { ...V2_DARK, primary: "150 80% 45%", background: "10 40% 8%" };
  const migrated = migrateTheme(v2Theme({ dark }));
  assert.equal(migrated.dark.primary, "150 80% 45%");
  assert.equal(migrated.dark.background, "10 40% 8%");
  assert.equal(migrated.dark.star, defaultTheme.dark.star);
  // A custom palette keeps its own background gradient too.
  assert.equal(migrated.background?.gradient, V2_GRADIENT);
});

test("an existing star colour survives migration", () => {
  const dark = { ...V2_DARK, primary: "150 80% 45%", star: "50 100% 60%" };
  assert.equal(migrateTheme(v2Theme({ dark })).dark.star, "50 100% 60%");
});

test("a custom legacy font becomes display and body font; old defaults do not", () => {
  const custom = migrateTheme(v2Theme({ font: "Space Grotesk" }));
  assert.equal(custom.fonts?.display, "Space Grotesk");
  assert.equal(custom.fonts?.body, "Space Grotesk");
  assert.equal(custom.fonts?.data, defaultFonts.data);
  assert.equal(custom.font, "Space Grotesk");

  for (const font of ["Outfit", "Inter"]) {
    const migrated = migrateTheme(v2Theme({ font }));
    assert.deepEqual(migrated.fonts, defaultFonts);
    assert.equal(migrated.font, defaultFonts.body);
  }
});

test("v2 themes get the default shape, surface and galaxy settings", () => {
  const migrated = migrateTheme(v2Theme());
  assert.deepEqual(migrated.shape, defaultShape);
  assert.deepEqual(migrated.surface, defaultSurface);
  assert.deepEqual(migrated.galaxy, defaultGalaxy);
});

test("migration is idempotent", () => {
  for (const theme of [v2Theme(), v2Theme({ dark: { ...V2_DARK, primary: "150 80% 45%" }, font: "Saira" }), defaultTheme]) {
    const once = migrateTheme(theme);
    assert.deepEqual(migrateTheme(once), once);
  }
});

test("current-version themes keep their design settings", () => {
  const theme: CustomTheme = {
    ...defaultTheme,
    shape: { style: "rund", size: 16, avatar: "kreis" },
    surface: { mode: "glas", opacity: 0.5, blur: 14 },
    fonts: { display: "Oxanium", body: "Archivo", data: "Fira Code" },
    galaxy: { stars: false, grid: false, constellation: true, constellationName: "lyra", grain: 0.12 },
  };
  const migrated = migrateTheme(theme);
  assert.deepEqual(migrated.shape, theme.shape);
  assert.deepEqual(migrated.surface, theme.surface);
  assert.deepEqual(migrated.fonts, theme.fonts);
  assert.deepEqual(migrated.galaxy, theme.galaxy);
  assert.equal(migrated.font, "Archivo");
});

test("a current-version theme that happens to use the v2 colours is not reset", () => {
  const theme = { ...v2Theme(), version: THEME_VERSION };
  assert.equal(migrateTheme(theme).dark.primary, V2_DARK.primary);
});

test("normalizers clamp numbers and reject unknown values", () => {
  assert.deepEqual(normalizeShape({ style: "blob" as never, size: 999, avatar: "stern" as never }), {
    style: defaultShape.style,
    size: 24,
    avatar: defaultShape.avatar,
  });
  assert.equal(normalizeShape({ size: -5 }).size, 0);
  assert.equal(normalizeShape({ size: 7.6 }).size, 8);
  assert.equal(normalizeShape({ size: Number.NaN }).size, defaultShape.size);

  assert.deepEqual(normalizeSurface({ mode: "milch" as never, opacity: 4, blur: -1 }), {
    mode: defaultSurface.mode,
    opacity: 1,
    blur: 0,
  });
  assert.equal(normalizeSurface({ blur: 80 }).blur, 24);

  assert.deepEqual(normalizeGalaxy({ stars: "yes" as never, grid: false, grain: 2 }), {
    stars: defaultGalaxy.stars,
    grid: false,
    constellation: defaultGalaxy.constellation,
    constellationName: defaultGalaxy.constellationName,
    grain: 0.3,
  });
  assert.equal(normalizeGalaxy({ constellationName: "orion" }).constellationName, "orion");
  assert.equal(normalizeGalaxy({ constellationName: "andromeda" as never }).constellationName, "auto");
  assert.equal(normalizeGalaxy({ grain: -1 }).grain, 0);
});

test("font names that could break out of a URL or CSS value are rejected", () => {
  const fonts = normalizeFonts({
    display: 'Roboto"; } body { display:none',
    body: "Inter&family=Evil",
    data: "x".repeat(61),
  });
  assert.deepEqual(fonts, defaultFonts);
  assert.equal(normalizeFonts({ body: "  IBM Plex Sans  " }).body, "IBM Plex Sans");
  assert.equal(normalizeFonts(undefined, "url(evil)").display, defaultFonts.display);
});

test("importTheme migrates, sanitises and round-trips with exportTheme", () => {
  const raw = {
    ...v2Theme({ dark: { ...V2_DARK, primary: "150 80% 45%" } }),
    background: {
      mode: "image",
      solidColor: "230 60% 6%",
      gradient: V2_GRADIENT,
      image: { type: "url", value: "javascript:alert(1)" },
      overlay: { enabled: true, color: "0 0% 0%", opacity: 9, blur: 100 },
    },
    shape: { style: "kante", size: 40, avatar: "quadrat" },
  };
  const imported = importTheme(JSON.stringify(raw));
  assert.ok(imported);
  assert.equal(imported.version, THEME_VERSION);
  assert.equal(imported.dark.primary, "150 80% 45%");
  assert.equal(imported.background?.image, undefined);
  assert.equal(imported.background?.overlay.opacity, 1);
  assert.equal(imported.background?.overlay.blur, 24);
  assert.deepEqual(imported.shape, { style: "kante", size: 24, avatar: "quadrat" });

  assert.deepEqual(importTheme(exportTheme(imported)), imported);
});

test("importTheme rejects malformed input", () => {
  assert.equal(importTheme("not json"), null);
  assert.equal(importTheme(JSON.stringify({ dark: V2_DARK })), null);
});
