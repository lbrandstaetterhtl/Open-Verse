# 🌌 Design Overhaul: Weightless Universe

Dieses Dokument dokumentiert die visuelle Transformation von Osiris hin zu einer celestialen, "schwerelosen" Ästhetik.

## 🎨 Die neue Farbpalette (Cosmic Palette)

Wir haben uns von flachen Farben verabschiedet und nutzen nun tiefe HSL-Werte, die die Unendlichkeit des Weltraums widerspiegeln.

| Element | HSL Wert | Beschreibung |
| :--- | :--- | :--- |
| **Background** | `230 50% 1%` | Ein ultra-tiefes Dunkelblau, fast Schwarz. |
| **Card** | `230 40% 3%` | Tiefe Glas-Elemente für den Content. |
| **Primary** | `217 91% 60%` | Ein leuchtendes "Celestial Blue" für Interaktionen. |
| **Accent** | `280 80% 60%` | Ein pulsierendes "Nebula Purple" für Akzente. |

---

## 🛰️ "Weightless" Physik & Animationen

Das Ziel ist es, dem User das Gefühl von Schwerelosigkeit zu vermitteln. Alle Interaktionen folgen nun einer "Zero-Gravity"-Logik.

### 1. Drift & Float
- **`weightless-float`**: Elemente wie das Logo driften sanft im Raum (Inertia-Animation).
- **`floating-element`**: Karten und Avatare haben eine subtile Auf-und-Ab-Bewegung (12s Zyklus), um Starrheit zu vermeiden.

### 2. Space Entrance
- Neue Page-Transitions (`spaceEnter`): Seiten erscheinen nicht einfach, sie "gleiten" mit einem leichten Scale-In und Unblur-Effekt in den Viewport.

---

## ✨ Visuelle Features

### 1. Animated Starfield
Die gesamte App wird nun von einem dynamischen Sternenfeld im Hintergrund begleitet.
- **Twinkle-Effekt**: Sterne pulsieren in unterschiedlichen Geschwindigkeiten.
- **Parallax-Drift**: Ein extrem langsamer Hintergrund-Drift (120s) erzeugt ein Gefühl von Bewegung durch das Universum.

### 2. Premium Glassmorphism
- **`glass-card`**: Karten haben nun eine stärkere Unschärfe (`backdrop-blur-2xl`) und eine hauchdünne `white/5` Border, die Lichtreflexe auf Glaskanten simuliert.
- **Nebula Glow**: Aktive Elemente strahlen ein sanftes, radiales Leuchten (Glow) aus, das an Gasnebel erinnert.

---

## 🛠️ Technische Umsetzung (Checklist)

- [x] **`index.css`**: Update der Root-Variablen und Keyframes.
- [x] **`Navbar.tsx`**: Integration des driften Logos und der Nebula-Header.
- [x] **`PostCard.tsx`**: Vollständiges Redesign der Content-Karten.
- [x] **`ThemeBackground.tsx`**: Implementierung des Starfield-Layers.

*Lead Developer – Osiris Design Team* 🚀
