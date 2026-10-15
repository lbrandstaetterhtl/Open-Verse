# 🌌 Osiris UI/UX Audit & Mobile Analysis

This document evaluates the current user interface and experience of Osiris, identifying potential friction points and mobile-specific issues.

> **Status 2026-10-14:** Items marked ✅ were verified as resolved in the code. Open items are unchanged design proposals.

## 📱 Mobile UX Analysis

### 1. Navigation Redundancy ✅ Resolved
- **Status**: The unused top `Navbar` component was removed; navigation is `AppSidebar` plus `MobileBottomNav`.
- **Issue**: There is a conflict between the `Navbar` (top hamburger menu) and the `MobileBottomNav` (bottom tab bar). Both offer navigation to feeds and communities, which can confuse users.
- **Impact**: Increased cognitive load and wasted screen real estate.
- **Recommendation**: Dedicate the `MobileBottomNav` to primary navigation and use the `Navbar` solely for branding and a simplified user/settings menu.

### 2. Interaction & Safe Areas ✅ Resolved
- **Status**: `client/src/index.css` now uses `overscroll-behavior-y: auto`.
- **Success**: The project correctly implements `env(safe-area-inset-bottom)`, ensuring the navigation bar doesn't overlap with the iOS home indicator.
- **Issue**: `overscroll-behavior: none` in `index.css` prevents the natural "elastic bounce" on iOS.
- **Impact**: The UI can feel rigid or "broken" to native mobile users who expect this feedback.
- **Recommendation**: Set to `overscroll-behavior-y: auto` to allow natural scrolling behavior while preventing horizontal shifts.

---

## 🎨 General User Friendliness

### 1. Fragmented Feeds
- **Issue**: "Media Feed" and "Discussions Feed" are currently separate pages. 
- **Impact**: Users have to switch pages to see different types of content, breaking the "flow" of discovery.
- **Recommendation**: Implement a unified "Discovery" feed with high-fidelity filters (e.g., "Media", "Talk", "All") to enhance the "Open-Verse" feeling of infinite exploration.

### 2. Feed Width & Spacing
- **Issue**: On large desktop screens (1280px+), the main content area might feel too expansive for a single-column social feed without a sidebar.
- **Impact**: Eye strain and "empty space" feel.
- **Recommendation**: Consider a multi-column layout for desktop (Sidebar | Feed | Context/Trends) or a tighter, centered feed column.

---

## 🛰️ Visual Language ✅ Replaced

The "Weightless Universe" look (glassmorphism, glow, floating elements) was replaced by the angular "Sternkarte" design language in October 2026; see `docs/DESIGN.md`. The motion/parallax proposals that were listed here no longer apply.

---

## 🚨 UX Friction Points (Checklist)

- [ ] **WS Status Indicator**: Very small on mobile; consider moving to the User Menu or a more prominent "Connection lost" banner if offline.
- [x] **Create Button**: Now opens `CreatePostSelectorDialog` instead of linking straight to `/post/news`.
- [x] **Admin Area Exit**: The admin sidebar has a "Back to App" entry.

---

*Lead Developer – Osiris UI/UX Design* 🚀
