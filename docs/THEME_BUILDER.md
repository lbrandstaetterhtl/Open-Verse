# 🎨 Theme Builder Documentation

The **Theme Builder** is a powerful tool in Open-Verse that allows users to create, customize, and share their own visual experiences. It uses a token-based system compatible with **shadcn/ui** and **TailwindCSS**.

## 🚀 Features

### 1. Dual-Mode Editing
- **Light & Dark Mode**: Independent control over both modes, or "Unified Mode" to link them together.
- **Token Mapping**: Direct control over semantic tokens like `primary`, `background`, `card`, `accent`, etc.

### 2. Advanced Backgrounds
- **Solid Colors**: Classic flat backgrounds.
- **Gradients**: A curated collection of "Space-Themed" gradients (Galaxy, Nebula, Stardust).
- **Custom Images**: Upload your own background images with automatic glassmorphism effects for the UI.

### 3. Real-Time Typography
- **Google Fonts Integration**: Switch between premium fonts like Inter, Roboto, Outfit, and more.
- **Live Sync**: Changes are applied instantly to the whole application.

### 4. Professional Workflow
- **Undo/Redo (Ctrl+Z / Ctrl+Y)**: Full history management for all theme changes.
- **Export/Import**: Save themes as `.json` files to share them with the community.
- **Mock Preview**: A realistic UI frame with mobile and desktop toggles to test your theme in various scenarios.

## 🛠️ Technical Architecture

### Core Logic
The system revolves around the `useCustomTheme` hook and the `applyTheme` utility.

- **Storage**: Themes are stored in the `themes` table in the database and cached in `localStorage` for instant application on load.
- **CSS Variables**: The builder converts color tokens into HSL values and injects them into the `:root` element.
- **Dynamic Backgrounds**: Uses the `ThemeBackground` component which handles glassmorphism and layer blending.

### File Structure
- `client/src/pages/theme/theme-builder.tsx`: The main UI.
- `client/src/hooks/use-custom-theme.ts`: State management and DB sync.
- `client/src/lib/theme-utils.ts`: Core utilities for math, conversion, and applying themes.
- `client/src/components/theme/`: Sub-components for the builder.

## 🌈 Theme Tokens

| Token | Description |
|-------|-------------|
| `primary` | Main brand color (buttons, active states). |
| `background` | The base color of the page. |
| `card` | Background of posts, containers, and panels. |
| `accent` | Highlight color for hover states. |
| `destructive` | Color for dangerous actions (delete, error). |
| `muted` | Subtle background for secondary UI elements. |

## 🔮 Planned Improvements
- [ ] **Image-to-Theme**: Automatically generate a color palette from an uploaded background.
- [ ] **Theme Marketplace**: A public gallery where users can browse and install community themes.
- [ ] **Animation Presets**: Custom transition speeds and curve settings.
- [ ] **Harmonizer**: A tool to automatically adjust secondary colors based on the primary choice.
