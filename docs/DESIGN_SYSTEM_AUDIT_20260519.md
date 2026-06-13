# Design System Audit — SchoolHub e-Hadir

**Date:** 2026-05-19  
**Auditor:** Pi Coding Agent  
**Scope:** Complete CSS token inventory, component catalog, layout system, visual patterns  
**Status:** Baseline for comprehensive design overhaul (Step 1/18)

---

## 1. CSS Custom Properties (Tokens)

### 1.1 Typography Tokens

| Token | Value | Usage | Assessment |
|---|---|---|---|
| `--font-serif` | `Georgia, 'Times New Roman', serif` | Headings, hero titles, stat numbers | ⚠️ System fallback, lacks character. Should be `ui-serif` + `Noto Serif` |
| `--font-sans` | `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` | Body text, UI elements | ✅ Good system stack, but `Inter` would add polish |
| `--font-mono` | `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace` | Numbers, timestamps, code | ✅ Acceptable for data |
| `--text-2xs` | `11px` | Captions, badges | ✅ |
| `--text-xs` | `clamp(11.5px, .72vw, 12.5px)` | Small labels, hints | ✅ Fluid |
| `--text-sm` | `clamp(12.5px, .78vw, 13.5px)` | Table text, secondary | ✅ Fluid |
| `--text-base` | `clamp(14px, .88vw, 15px)` | Body text | ✅ Fluid |
| `--text-md` | `clamp(15px, .95vw, 16px)` | Lead paragraphs | ✅ Fluid |
| `--text-lg` | `clamp(17px, 1.1vw, 18px)` | Sub-headings | ✅ Fluid |
| `--text-xl` | `clamp(20px, 1.5vw, 24px)` | Section headings | ✅ Fluid |
| `--text-2xl` | `clamp(24px, 2vw, 32px)` | Page titles | ✅ Fluid |
| `--text-hero` | `clamp(32px, 3.5vw, 48px)` | Hero headings | ✅ Fluid |

**Gap:** No explicit `font-weight` tokens. No `line-height` tokens. No `letter-spacing` tokens.

### 1.2 Color Tokens — Background & Surface

| Token | Value | Usage | Assessment |
|---|---|---|---|
| `--bg` | `#16181c` | App background | ✅ Deep, neutral dark |
| `--bg-2` | `#1e2025` | Elevated background | ✅ Good depth |
| `--surface` | `rgba(30, 32, 37, 0.78)` | Card backgrounds | ✅ Glassmorphism base |
| `--surface-solid` | `#1e2025` | Solid surfaces | ✅ |
| `--surface-2` | `rgba(38, 40, 47, 0.85)` | Hover states | ✅ |
| `--surface-elevated` | `rgba(45, 48, 56, 0.92)` | Modals, dropdowns | ✅ |

**Gap:** Only 4 surface layers. Need `--surface-3` for deeper nesting. No `--surface-glass` with `backdrop-filter`.

### 1.3 Color Tokens — Text

| Token | Value | Usage | Assessment |
|---|---|---|---|
| `--fg` | `#f0ede8` | Primary text | ✅ Warm off-white, readable |
| `--fg-muted` | `#a8a29e` | Secondary text | ✅ Good contrast |
| `--fg-dim` | `#78716c` | Tertiary text | ✅ |
| `--fg-faint` | `#57534e` | Placeholders, disabled | ✅ |

**Gap:** No `--fg-inverse` for colored backgrounds. No `--fg-accent` for primary-colored text.

### 1.4 Color Tokens — Primary (Amber/Gold)

| Token | Value | Usage | Assessment |
|---|---|---|---|
| `--primary` | `#f59e0b` | CTA, active states | ✅ Strong amber |
| `--primary-2` | `#fbbf24` | Hover, highlights | ✅ Lighter |
| `--primary-3` | `#d97706` | Pressed, dark | ✅ Darker |
| `--primary-dim` | `rgba(245, 158, 11, 0.15)` | Background tint | ✅ |
| `--primary-glow` | `rgba(245, 158, 11, 0.25)` | Focus rings | ✅ |

**Gap:** Monochromatic amber only. No secondary or tertiary accent colors. Every CTA, highlight, and focus ring uses the same amber — creates visual fatigue.

### 1.5 Color Tokens — Semantic (Status)

| Token | Value | Usage | Assessment |
|---|---|---|---|
| `--ok` | `#34d399` | Success, hadir | ✅ Emerald |
| `--ok-soft` | `rgba(52, 211, 153, 0.12)` | Success background | ✅ |
| `--warn` | `#fbbf24` | Warning, telat | ⚠️ Same as `--primary-2` — confusing overlap |
| `--warn-soft` | `rgba(251, 191, 36, 0.12)` | Warning background | ⚠️ Overlap with primary |
| `--bad` | `#f87171` | Error, alpa | ✅ Rose red |
| `--bad-soft` | `rgba(248, 113, 113, 0.12)` | Error background | ✅ |
| `--info` | `#60a5fa` | Info, izin | ✅ Blue |
| `--info-soft` | `rgba(96, 165, 250, 0.12)` | Info background | ✅ |

**Gap:** `--warn` and `--primary-2` are identical (`#fbbf24`). This causes ambiguity between warnings and primary actions. Need distinct warning color (e.g., `#f59e0b` for primary, `#fbbf24` → `#f59e0b` or use `#f97316` orange for warnings).

### 1.6 Color Tokens — Accent (Misc)

| Token | Value | Usage | Assessment |
|---|---|---|---|
| `--accent` | `#f59e0b` | Alias for primary | ⚠️ Redundant |
| `--accent-2` | `#fbbf24` | Alias for primary-2 | ⚠️ Redundant |
| `--accent-3` | `#34d399` | Success highlight | ⚠️ Should be `--ok` |
| `--accent-warm` | `#f97316` | Warm orange | ✅ Underutilized |
| `--accent-hot` | `#ef4444` | Hot red | ✅ Underutilized |
| `--accent-soft` | `rgba(245, 158, 11, 0.12)` | Alias for primary-dim | ⚠️ Redundant |
| `--accent-ring` | `rgba(245, 158, 11, 0.30)` | Focus ring | ⚠️ Redundant |

**Gap:** 7 accent tokens, but 5 are aliases or underutilized. Need a true secondary palette (e.g., sky blue `#0ea5e9` for info/actions, violet `#a78bfa` for highlights).

### 1.7 Gradient Tokens

| Token | Value | Usage | Assessment |
|---|---|---|---|
| `--dopamine-gradient` | `linear-gradient(135deg, #f59e0b 0%, #fbbf24 35%, #34d399 100%)` | Horizontal bar chart, progress bars | ✅ Nice 3-color blend |

**Gap:** Only one gradient token. Need `--gradient-hero`, `--gradient-card`, `--gradient-primary`, `--gradient-surface`.

### 1.8 Shadow Tokens

| Token | Value | Usage | Assessment |
|---|---|---|---|
| `--shadow-lg` | `0 20px 60px -28px rgba(0,0,0,0.72), 0 1px 0 rgba(255,255,255,0.03) inset` | Modals, hero | ✅ Dramatic |
| `--shadow-card` | `0 4px 24px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.03) inset` | Cards | ✅ Good |

**Gap:** Only 2 shadow levels. Need `--shadow-sm`, `--shadow-md`, `--shadow-xl`, `--shadow-inner`, `--shadow-glow` (colored).

### 1.9 Glow/Effect Tokens

| Token | Value | Usage | Assessment |
|---|---|---|---|
| `--glow` | `radial-gradient(700px circle at 14% -6%, rgba(245,158,11,0.10), transparent 58%), radial-gradient(560px circle at 88% 6%, rgba(251,191,36,0.06), transparent 62%)` | Sidebar background | ✅ Subtle ambient |

**Gap:** Only one glow. Need per-role glows (teal for guru, blue for siswa). Need `--glow-primary`, `--glow-success`, `--glow-card`.

### 1.10 Radius Tokens

| Token | Value | Assessment |
|---|---|---|
| `--radius-sm` | `8px` | ✅ |
| `--radius` | `12px` | ✅ |
| `--radius-lg` | `16px` | ✅ |
| `--radius-xl` | `20px` | ✅ |
| `--radius-full` | `9999px` | ✅ |

**Gap:** No `--radius-none` (0px). No `--radius-pill` alias (though `--radius-full` works).

### 1.11 Spacing Tokens

**Gap:** No explicit spacing tokens. Spacing is hardcoded throughout CSS (`14px`, `16px`, `18px`, `20px`, `22px`, `24px`, `26px`, `28px`, `32px`, `40px`). Need `--space-1` through `--space-12` or `--space-xs`, `--space-sm`, `--space-md`, `--space-lg`, `--space-xl`.

### 1.12 Border Tokens

| Token | Value | Assessment |
|---|---|---|
| `--border` | `rgba(255, 255, 255, 0.06)` | ✅ Subtle |
| `--border-2` | `rgba(255, 255, 255, 0.10)` | ✅ Slightly stronger |

**Gap:** No `--border-subtle`, `--border-strong`, `--border-primary`, `--border-focus`.

### 1.13 Z-Index Tokens

**Gap:** No z-index tokens. Hardcoded values: `z-index: 60` (dock), `100` (topbar), `140` (backdrop), `150` (sidebar), `400` (search results), `500` (modal overlay), `1000` (skip-link).

---

## 2. Component Catalog

### 2.1 From `ui.tsx` (33 exported items)

| # | Component | Type | Props | Usage Frequency | Assessment |
|---:|---|---|---|---|---|
| 1 | `ToastHost` | Feedback | `toast`, `onClose` | Global (1x) | ✅ Good, has role=status |
| 2 | `Pill` | Badge | `tone`, `children`, `dot` | High | ✅ Simple, flexible |
| 3 | `statusLabel` | Utility | `status` | Very High | ✅ Comprehensive mapping |
| 4 | `StatusPill` | Badge | `status` | Very High | ✅ Auto-tone mapping |
| 5 | `ProgressRing` | Chart | `value`, `label`, `sub` | Medium | ✅ CSS-only donut |
| 6 | `StackedBar` | Chart | `segments`, `total` | Medium | ✅ CSS-only stacked bar |
| 7 | `TrendChart` | Chart | `data`, `valueKeys`, `labelKeys` | Medium | ✅ CSS-only bar chart |
| 8 | `StatusDonut` | Chart | `counts`, `title` | Medium | ✅ CSS-only donut |
| 9 | `HorizontalBarList` | Chart | `data`, `labelKeys`, `valueKeys` | Medium | ✅ CSS-only horizontal bar |
| 10 | `Avatar` | Display | `name`, `size` | High | ✅ Color hash, initials |
| 11 | `Btn` | Action | `variant`, `size`, `children`, `loading`, `disabled` | Very High | ✅ Has loading state |
| 12 | `IconBtn` | Action | `label`, `children` | High | ✅ Requires aria-label |
| 13 | `Field` | Form | `label`, `hint`, `children` | Very High | ✅ Simple wrapper |
| 14 | `TextInput` | Form | `icon`, `...props` | Very High | ✅ Supports textarea |
| 15 | `SelectInput` | Form | `wrapperClassName`, `className`, `...props` | Very High | ✅ |
| 16 | `Card` | Container | `title`, `sub`, `actions`, `children`, `pad` | Very High | ⚠️ Single variant only |
| 17 | `PageHead` | Layout | `eyebrow`, `title`, `sub`, `actions` | High | ✅ |
| 18 | `LoadingState` | State | `label`, `sub` | High | ✅ Standardized |
| 19 | `ErrorState` | State | `error`, `onRetry`, `title`, `hint` | High | ✅ Friendly error mapping |
| 20 | `EmptyState` | State | `title`, `sub`, `action` | High | ✅ |
| 21 | `FriendlyEmptyState` | State | `title`, `sub`, `action` | Low | ⚠️ Redundant with EmptyState |
| 22 | `SimpleHelpBox` | Info | `title`, `items`, `children` | Medium | ✅ |
| 23 | `StepGuide` | Info | `title`, `steps` | Medium | ✅ Numbered steps |
| 24 | `QuickActionCard` | Action | `title`, `desc`, `icon`, `actionLabel`, `onClick`, `tone` | Medium | ⚠️ Basic hover |
| 25 | `RoleTaskPanel` | Layout | `title`, `tasks` | Medium | ✅ Wraps QuickActionCard |
| 26 | `DataTable` | Data | `rows`, `columns`, `empty`, `onRow` | Very High | ✅ Responsive mobile cards |
| 27 | `Pagination` | Data | `meta`, `onPage` | Medium | ✅ Simple |
| 28 | `StatCardPremium` | Display | `icon`, `label`, `value`, `sub`, `tone`, `onClick` | High | ✅ Icon + value + label |
| 29 | `RosterProgress` | Display | `current`, `total` | Medium | ✅ Progress bar |
| 30 | `SkeletonCard` | Loading | — | Low | ⚠️ Basic skeleton |
| 31 | `SkeletonTable` | Loading | `rows` | Low | ⚠️ Very basic skeleton |
| 32 | `StatusIconPill` | Badge | `status`, `icon` | Low | ✅ Icon + pill |
| 33 | `AsyncTable` | Data | `state`, `columns`, `empty`, `onRow` | High | ✅ Auto loading/error/empty |

### 2.2 From `SchoolHubApp.tsx` (Layout/Shell)

| Component | Type | Assessment |
|---|---|---|
| `Sidebar` | Navigation | ⚠️ Functional, not visually distinctive |
| `TopBar` | Navigation | ⚠️ Standard topbar, search + crumbs |
| `AppLayout` | Layout | ✅ Error boundary + tutorial + connection |
| `AppErrorBoundary` | Error | ✅ Chunk load fallback |
| `PageLoading` | Loading | ⚠️ Very basic (just text) |

### 2.3 Page-Specific Components

| Component | Source | Assessment |
|---|---|---|
| `DashboardMiniList` | `AdminPages.jsx` | ✅ Mini row with status + meta |
| `GenericTableState` | `GuruPages.jsx` | ⚠️ Fallback table, not styled |
| `AttendanceTableState` | `GuruPages.jsx` | ✅ Friendly column mapping |
| `AttendanceTable` | `MyAttendancePage.jsx` | ✅ Smart column visibility |

---

## 3. Layout System

### 3.1 App Shell

```
.app (grid: 260px 1fr)
├── .side (sticky sidebar, 260px)
│   ├── .brand (logo + text)
│   ├── .nav-body (nav sections + items)
│   └── .side-foot (user card + logout)
├── .main (flex column)
│   ├── .topbar (sticky, 56px)
│   │   ├── hamburger
│   │   ├── breadcrumbs
│   │   ├── searchbox
│   │   └── actions (clock, tutorial, notif)
│   └── .content (padding: 22px 26px 40px)
└── .side-backdrop (mobile overlay)
```

**Assessment:** ✅ Solid layout structure. ⚠️ Sidebar 260px feels narrow for modern apps (280-300px standard). ⚠️ No max-width on content area (stretches infinitely on ultra-wide).

### 3.2 Grid System

| Class | Desktop | Tablet | Mobile |
|---|---|---|---|
| `.g-2` | 2 cols | 2 cols | 1 col |
| `.g-3` | 3 cols | 2 cols | 1 col |
| `.g-4` | 4 cols | 2 cols | 1 col |

**Assessment:** ✅ Simple and functional. ⚠️ No `g-5`, `g-6`. No auto-fill grid for dynamic content.

### 3.3 Breakpoints

| Breakpoint | Behavior |
|---|---|
| `1024px` | Sidebar shrinks 260px → 240px |
| `768px` | App switches to flex column, sidebar becomes fixed overlay |
| `480px` | Content padding reduces, chart sizes shrink |

**Assessment:** ⚠️ Only 3 breakpoints. No `1440px+` for large screens. No `640px` for phablets.

---

## 4. Visual Patterns

### 4.1 Card Patterns

Current card styles:
- Border: `1px solid var(--border)`
- Background: `var(--surface)` (transparent) or `var(--surface-solid)`
- Border-radius: `var(--radius-lg)` (16px)
- Padding: `20px` (default), `16px` mobile

**Variations found:**
- `.card` — standard
- `.card.pad-lg` — larger padding (for states)
- `.card.pad` — standard padding
- No elevated, glass, or flat variants

### 4.2 Button Patterns

| Variant | Background | Border | Text | Usage |
|---|---|---|---|---|
| Default | `var(--surface-2)` | `transparent` | `var(--fg)` | Secondary actions |
| Primary | `var(--primary)` | `var(--primary)` | `#1c1917` (dark) | CTA |
| Danger | `var(--bad)` | `var(--bad)` | `white` | Destructive |
| Ghost | `transparent` | `var(--border)` | `var(--fg-muted)` | Tertiary |

**Sizes:** `sm` (32px), default (~40px), `lg` (48px), `icon` (36×36px)

### 4.3 Status Pill Patterns

| Status | Tone | Background | Text |
|---|---|---|---|
| HADIR | ok | `var(--ok-soft)` | `var(--ok)` |
| TELAT | warn | `var(--warn-soft)` | `var(--warn)` |
| IZIN | info | `var(--info-soft)` | `var(--info)` |
| SAKIT | bad | `var(--bad-soft)` | `var(--bad)` |
| ALPA | — | `rgba(120,113,108,0.12)` | `var(--fg-muted)` |

**Assessment:** ✅ Consistent soft-solid pairing. ⚠️ ALPA color is gray, which makes it look "inactive" rather than "absent".

### 4.4 Hero/Dashboard Patterns

| Element | Style |
|---|---|
| `.dashboard-hero` | Radial gradient + linear gradient + `::after` pseudo glow |
| `.dashboard-hero-panel` | `backdrop-filter: blur(16px)` + semi-transparent bg |
| `.hero-kpi-grid` | 3-column grid with bordered boxes |
| `.teacher-hero` | Teal radial gradient variant |
| `.student-hero` | Blue radial gradient variant |

**Assessment:** ✅ Sophisticated background effects. ⚠️ Pseudo-element glow (`::after`) is fixed position — may not adapt well to content height changes.

---

## 5. Animation & Motion

### 5.1 Existing Animations

| Animation | Duration | Easing | Trigger |
|---|---|---|---|
| `skeletonShimmer` | `1.5s` | `ease` | Infinite (skeleton loading) |
| `menuIn` | `0.18s` | `ease` | Search results appear |
| `modalSlideIn` | `0.25s` | `cubic-bezier(.18, .89, .32, 1.28)` | Modal open |
| `pulse` | `1.2s` | `ease` | Infinite (connection lamp) |
| Button hover | `0.15s` | `ease` | Mouse hover |
| Card transition | `0.2s` | `var(--ease-out)` | Various |
| Nav-item transition | `0.2s` | `var(--ease-out)` | Hover |
| Sidebar slide | `0.3s` | `ease` | Mobile toggle |

### 5.2 Missing Animations

| Animation | Priority | Where Needed |
|---|---|---|
| Page/route transition | P1 | Between routes |
| Card hover lift | P2 | All cards |
| Number count-up | P2 | Stat values |
| Progress ring fill | P2 | Dashboard KPI |
| Staggered list entry | P2 | Tables, roster |
| Toast slide-in | P2 | Notifications |
| Skeleton shimmer refinement | P3 | SkeletonCard/Table |
| Chart bar grow | P3 | TrendChart, StackedBar |
| Button press feedback | P3 | All buttons |
| Ripple effect | P3 | Primary buttons |

---

## 6. Accessibility Audit

| Feature | Status | Notes |
|---|---|---|
| Skip link | ✅ | `.skip-link` to `#main-content` |
| Focus visible | ✅ | Global `:focus-visible` rule added |
| ARIA labels | ✅ | `aria-label` on icon buttons |
| Role attributes | ✅ | `role="status"`, `role="alert"` on states |
| Color contrast | ✅ | `#f0ede8` on `#16181c` = 15:1 |
| Touch targets | ✅ | Min 44px on nav items |
| Keyboard navigation | ⚠️ | Tab order not explicitly tested |
| Screen reader | ⚠️ | No `aria-describedby` on complex forms |
| Reduced motion | ✅ | `@media (prefers-reduced-motion)` |

---

## 7. Summary — Strengths vs Gaps

### Strengths (Keep)
1. ✅ Complete token system (colors, typography, radius, shadows)
2. ✅ Glassmorphism effects (backdrop-filter, gradients)
3. ✅ Responsive grid and mobile card layout
4. ✅ 33 reusable UI components
5. ✅ Semantic color system (ok/warn/bad/info)
6. ✅ Fluid typography with `clamp()`
7. ✅ Error boundary and loading states
8. ✅ Accessibility basics covered

### Critical Gaps (Fix in overhaul)
1. 🔴 **Monochromatic palette** — Only amber primary, no secondary/tertiary accents
2. 🔴 **Warn/Primary color overlap** — `#fbbf24` used for both warnings and primary highlights
3. 🔴 **No spacing tokens** — Hardcoded pixel values throughout
4. 🔴 **Single card variant** — No elevated, glass, or flat card options
5. 🔴 **Missing animations** — No page transitions, card hover effects, number animations
6. 🔴 **Narrow sidebar** — 260px feels cramped; 280-300px standard
7. 🔴 **No content max-width** — Stretches infinitely on ultra-wide screens
8. 🔴 **Basic empty states** — Icon + text only; no illustrations
9. 🔴 **Limited breakpoints** — Missing 1440px+ and 640px breakpoints
10. 🔴 **No z-index tokens** — Hardcoded magic numbers

### Minor Gaps (Polish)
1. 🟡 Typography lacks weight/line-height/letter-spacing tokens
2. 🟡 Border tokens limited (only 2 levels)
3. 🟡 Shadow tokens limited (only 2 levels)
4. 🟡 Surface depth limited (only 4 levels)
5. 🟡 Gradient tokens limited (only 1)
6. 🟡 Glow effects limited (only 1)
7. 🟡 `FriendlyEmptyState` redundant with `EmptyState`
8. 🟡 Skeleton components very basic
9. 🟡 `PageLoading` is just text (no spinner/skeleton)
10. 🟡 Accent token namespace messy (aliases everywhere)

---

## 8. Recommendations by Step

| Step | Priority | Focus |
|---|---|---|
| 2 — Expand Color Palette | 🔴 Critical | Add secondary (sky `#0ea5e9`), tertiary (violet `#a78bfa`), fix warn/primary overlap |
| 3 — Typography | 🟡 Medium | Add weight/line-height tokens, refine font stack |
| 4 — Card System | 🔴 Critical | Add elevated/glass variants, hover animations |
| 5 — Dashboard | 🔴 Critical | Richer gradients, animated stats, better spacing |
| 6 — Table | 🟡 Medium | Density modes, row hover accent, refined mobile cards |
| 7 — Form | 🟡 Medium | Field grouping, validation visuals, 2-column layout |
| 8 — Charts | 🟡 Medium | Entry animations, tooltips, glow effects |
| 9 — Empty States | 🔴 Critical | Illustrations, better copy, CTA actions |
| 10 — Sidebar | 🟡 Medium | Wider sidebar, active state accent, user card polish |
| 11 — Micro-interactions | 🟡 Medium | Page transitions, card hover, number count-up |
| 12 — Attendance | 🟡 Medium | Checkpoint glow, action button grouping, roster stagger |
| 13 — Master Data | 🟡 Medium | Section cards, 2-column forms, density |
| 14 — Dark Theme | 🟡 Medium | More surface layers, refined borders, depth |
| 15 — Responsive | 🟡 Medium | Add 1440px+ and 640px breakpoints, content max-width |
| 16 — Documentation | 🟢 Low | Token docs, component usage guide |

---

**Next Step:** Proceed to Step 2 — Expand Color Palette (Richer Visual Identity).
