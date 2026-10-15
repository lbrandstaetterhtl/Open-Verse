# Design-Sprache „Sternkarte“

Ersetzt das frühere „Weightless Universe“-Design (Glas, Glow, Verläufe, sehr runde Ecken). Ziel: weniger generisch, kantiger, klarer – mit dem Galaxie-Gefühl als Hintergrund statt als Effekt auf jedem Element. Alles bleibt über den Theme-Builder anpassbar.

## Grundsätze

- **Linien statt Glas:** Flächen bekommen eine 1-px-Linie (`box-shadow: inset`), keine Unschärfe, keinen Glow, keine Schatten.
- **Ecken mit Fase:** Standardmäßig sind zwei gegenüberliegende Ecken abgeschrägt (`clip-path`). Alternativ „Kante“ (2 px) oder „Rund“.
- **Normale Schreibweise:** Satzanfang groß, keine Großbuchstaben-Überschriften, kein Kursiv, kein `font-black`. Großbuchstaben nur für kleine Labels (`ov-label`).
- **Drei Schriftrollen:** Überschriften (Display, Standard *Chakra Petch*), Text (*Instrument Sans*), Zahlen & Zeiten (*JetBrains Mono*).
- **Galaxie im Hintergrund:** Sternenfeld, Koordinatenraster, Körnung und ein Sternbild im Seitenkopf. Einzeln abschaltbar.
- **Nur Tokens:** Farben, Radien und Schriften kommen aus CSS-Variablen. Keine festen Farben oder `rounded-[…]`-Werte in Komponenten.

## Tokens

| Variable | Zweck |
| --- | --- |
| `--background`, `--foreground`, `--card`, `--primary`, … | shadcn-Farbtokens, vom Theme gesetzt |
| `--star` | Akzent „Sternlicht“ (warm), z. B. für hervorgehobene Zahlen und Sternbild |
| `--success` | Positiver Status (nicht im Theme-Builder, folgt Hell/Dunkel) |
| `--chart-1` … `--chart-5` | Diagrammfarben, abgeleitet aus primary, star, success, destructive, muted-foreground |
| `--radius-xs/sm/md/lg/pill` | Radien; bei „Fase“ und „Kante“ alle 2 px |
| `--cut`, `--cut-sm` | Größe der Fase an Panels bzw. Buttons |
| `--surface-opacity`, `--surface-blur` | Deckkraft und Unschärfe der Panels |
| `--font-display`, `--font-body`, `--font-data` | Schriftrollen |
| `--grain` | Stärke der Körnung |

Die Werte setzt `applyTheme()` / `applyDesign()` in `client/src/lib/theme-utils.ts` auf `<html>`. Form, Oberfläche und Galaxie-Ebenen stehen zusätzlich als Attribute dort (`data-shape`, `data-avatar`, `data-surface`, `data-blur`, `data-stars`, `data-grid`, `data-constellation`).

## Bausteine (`client/src/index.css`)

| Klasse | Verwendung |
| --- | --- |
| `ov-panel` | Karten, Abschnitte, Popover. Zusätze: `ov-panel-solid`, `ov-panel-hover`, `ov-panel-active`, `ov-panel-danger` |
| `ov-cut` / `ov-cut-2` | Eine bzw. zwei abgeschrägte Ecken (Buttons, Bilder in Panels) |
| `ov-avatar` | Avatar-Form (Achteck, Quadrat oder Kreis) |
| `ov-label` | Kleines Label in der Daten-Schrift (Eyebrow, Spaltenkopf) |
| `ov-data` | Zahlen, Zeiten, IDs (Daten-Schrift, Tabellenziffern) |
| `ov-chip` | Status-Chip. Varianten: `-primary`, `-star`, `-success`, `-danger` |
| `ov-tab-active`, `ov-nav-active` | Aktiver Tab bzw. aktiver Navigationseintrag |
| `ov-rule` | Haarlinie unter einem Bereich |

Seitenköpfe nutzen `PageHeader` (`client/src/components/layout/page-header.tsx`): Eyebrow, Titel, Beschreibung, Aktionen und das Sternbild.

Tailwind kennt zusätzlich `font-display`, `font-data`, `text-star`, `bg-star/…`, `text-success` und die Radien `rounded-xs` bis `rounded-pill`.

## Regeln für neue Komponenten

- `ov-panel` nicht mit `border`, `shadow-*` oder `rounded-[…]` kombinieren – die Linie und die Ecken kommen von der Klasse.
- Elemente, die über den Rand eines Panels hinausragen müssen (Badges, Menüs), nicht in ein `ov-panel` mit Fase legen; `clip-path` schneidet sie ab.
- Fokus: Klassen mit eigener Linie (`ov-panel`, `ov-chip`, `ov-tab-active`, …) zeigen den Fokus als innere 2-px-Linie in `--ring`.
- Animation nur für Zustände (Laden, Öffnen). Keine dauerhaft schwebenden oder pulsierenden Elemente.

## Theme-Migration

Gespeicherte Themes haben `version: 3`. Ältere Themes werden beim Laden mit `migrateTheme()` umgewandelt: Eine unveränderte alte Standard-Palette bekommt die neue Palette, eigene Farben bleiben erhalten und erhalten nur `star` dazu. Eine eigene Schrift wird zu Überschrift und Text. Tests: `npm run test:unit`.
