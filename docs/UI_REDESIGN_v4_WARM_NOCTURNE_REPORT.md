# UI Redesign v4 — Warm Nocturne Final Report

## Overview
Complete visual redesign of SchoolHub e-Hadir web app and ID Card Generator to a **Warm Nocturne** aesthetic — dark-mode-first, warm amber/gold accented, with glassmorphism cards, serif headings (Playfair Display), and subtle Islamic geometric motifs.

## Key Changes

### Design Philosophy
- **Primary**: Warm amber/gold (`#f59e0b` family)
- **Accent**: Teal-green complement for status indicators
- **Backgrounds**: Deep warm dark (`#111014`) for dark mode, warm parchment (`#faf5ed`) for light mode
- **Typography**: Playfair Display for headings, Inter for body, JetBrains Mono for data
- **Glassmorphism**: `backdrop-filter: blur(16px)` with semi-transparent surfaces
- **Geometric accent**: 8-point star motif in login and hero sections

### Files Modified — Main App (`apps/web/`)

1. **`src/styles.css`** — Completely rewritten design system
   - New design tokens for all 5 themes (dark, light, midnight, ocean, warm)
   - Hex/RGBA instead of OKLCH for broader compatibility
   - Glassmorphism card system with `.glass-card` and `.glass-card__corner`
   - Status orb system (`.status-orb`) replacing pills
   - Animation keyframes: `fadeIn`, `slideUp`, `toastSlideIn`, `modalBackdropIn`, `modalContentIn`, `skeletonShimmer`
   - Backward-compatible legacy classes for all old component class names

2. **`src/app/ui.tsx`** — Core component updates
   - `StatusPill` → `.status-orb` classes
   - `Avatar` → HSL instead of OKLCH
   - `PageHead` → new `.page-head__*` classes
   - `LoadingState` / `ErrorState` / `EmptyState` → `.empty-state` pattern
   - `StatCardPremium` → warm styling with icon backgrounds
   - `BottomNav` → `.bottom-nav__item`

3. **`src/app/pages/guru/GuruPages.jsx`**
   - Replaced local `StatCard` with imported `StatCardPremium`

### Files Modified — Generator App (`DataSekolah/generator-tanda-pengenal/`)

1. **`tailwind.config.js`**
   - Added `darkMode: 'class'`
   - Extended fonts: Playfair Display, JetBrains Mono
   - Redefined `primary` as amber/gold scale
   - Added `warm` and `ink` color scales

2. **`src/index.css`**
   - Google Fonts import
   - Warm parchment background (`#faf5ed`)
   - Updated scrollbar and drop-zone colors

3. **`src/components/layout/Layout.jsx`** → `bg-warm-100`
4. **`src/components/layout/Header.jsx`** → Glassmorphism, amber accents
5. **`src/components/layout/Sidebar.jsx`** → Dark warm gradient, amber active state
6. **`src/pages/Dashboard.jsx`** → Amber/warm stat cards
7. **`src/pages/ImportData.jsx`** → Amber primary buttons and badges
8. **`src/pages/Export.jsx`** → Amber status tones
9. **`src/pages/GenerateCards.jsx`** → Amber gradients
10. **`src/pages/Users.jsx`** → Amber badges and icons

## Build Results

### Main App
```
dist/assets/index-*.css   32.44 kB │ gzip: 6.82 kB  (was 60.13 kB)
dist/assets/index-*.js    213.58 kB │ gzip: 67.25 kB
✓ built in 1.46s
```

### Generator App
```
✓ vite build (no errors)
```

### Tests
```
Test Files  2 passed (2)
     Tests  4 passed (4)
```

## Theme Summary
| Theme | Label | Background | Surface | Primary | Accent |
|-------|-------|-----------|---------|---------|--------|
| dark | Hutan Gelap | `#111014` | `#18161b` | `#f59e0b` | `#0ea5e9` |
| light | Terang Bersih | `#faf5ed` | `#ffffff` | `#d97706` | `#0d9488` |
| midnight | Tengah Malam | `#0B0F1A` | `#111827` | `#f59e0b` | `#38bdf8` |
| ocean | Samudra | `#0C1A25` | `#132a3a` | `#f59e0b` | `#22d3ee` |
| warm | Hangat Pasir | `#1a1410` | `#231b15` | `#f59e0b` | `#fb923c` |

## Backward Compatibility
- All old CSS class names preserved as aliases
- No API contracts changed
- No QR payload changes
- No security logic modified
- No route/role changes
- All existing tests pass
