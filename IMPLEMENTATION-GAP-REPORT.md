# SIAB2 Implementation Gap Report

## Status

NEEDS_REDESIGN

## Gap Summary

Current `/siab2-preview` in `abensi` is a safe scoped preview implementation, not a pixel-perfect port of UI Lab Visual Finalization Pass 3. It keeps the route isolated and avoids backend/auth/dashboard impact, but visually it replaces the approved UI Lab system with a simplified landing page: basic sticky navbar, simple hero, simplified status card, four plain module cards, reduced dashboard mockup, and minimal footer.

This is not acceptable for the new direction. The redesign must rebuild `/siab2-preview` from UI Lab Pass 3 component-by-component and screenshot-by-screenshot.

Current target files observed:

* `apps/web/src/app/pages/SIAB2PreviewLanding.tsx`
* `apps/web/src/styles.css`

UI Lab source observed:

* `/home/fahmi/Downloads/LAB GITHUB/LAB BETA/SIAB2/src/App.tsx`
* `/home/fahmi/Downloads/LAB GITHUB/LAB BETA/SIAB2/src/components/*`
* `/home/fahmi/Downloads/LAB GITHUB/LAB BETA/SIAB2/src/index.css`
* `/home/fahmi/Downloads/LAB GITHUB/LAB BETA/SIAB2/VISUAL-HANDOFF.md`
* `/home/fahmi/Downloads/LAB GITHUB/LAB BETA/SIAB2/SIAB2-visual-final-pass3-review.zip`

## Section-by-section Gap

### Navbar

* What UI Lab has: centered fixed pill navbar with MAN 1 Rokan Hulu logo, compact SIAB2 identity, nav links (`Beranda`, `Modul`, `Peran`, `Tampilan`, `Kontak`), active link styling, blue gradient/accent login CTA, scroll-state polish, and mobile hamburger/full-screen drawer matching `p3_390_navbar_open.png`.
* What current implementation lacks: current nav is a simple sticky row with fewer links (`Modul`, `Preview`, `Masuk`), no UI Lab active-link behavior, no centered pill geometry, no matching mobile drawer, and no Pass 3 spacing/shadow fidelity.
* What must be rebuilt: port UI Lab `Navbar` layout and states into `/siab2-preview`, including desktop pill nav, mobile top bar, hamburger/open state, link labels, logo treatment, and CTA styling.

### Hero

* What UI Lab has: cinematic first fold with video/dark masked background, institutional identity badge, large Instrument Serif italic `SIAB2`, uppercase subtitle, rotating role sentence, precise CTAs (`Lihat Tampilan`, `Jelajahi Modul`), scroll indicator, and bottom academic ledger strip.
* What current implementation lacks: current hero uses static radial gradients, generic copy, no video background, no institutional identity badge matching Pass 3, no rotating role sentence, no scroll indicator, no ledger strip, and different CTA wording/layout.
* What must be rebuilt: port UI Lab `Hero`, including typography scale, spacing, CTA styles, background treatment, role copy behavior, and ledger strip. If HLS/video fidelity requires unavailable dependencies, mark BLOCKED_FOR_APPROVAL instead of simplifying.

### Status card

* What UI Lab has: hero-side `Status Portal SIAB2` card with emerald live dot, `Tahun Ajaran` tag, four metric blocks, presensi progress bar, status pill `Tersusun`, footer line `Portal SIAB2 Terintegrasi` / `MAN 1 Rokan Hulu`, glass/dark card styling, and exact Pass 3 proportions.
* What current implementation lacks: current status card is a generic two-column stat grid with six simple stats and explanatory paragraph. It lacks the specific presensi progress layout, micro footer, hierarchy, and Pass 3 visual density.
* What must be rebuilt: port UI Lab `AcademicPreviewCard` structure and visual details inside the hero.

### Modules

* What UI Lab has: bento-grid `AcademicModules` section with section eyebrow, large mixed typography heading (`akademik` in Instrument Serif accent), descriptive copy, four asymmetric cards, card tags, arrow buttons, and embedded previews: table, progress chart, timeline, and signed document mockup.
* What current implementation lacks: current modules are four uniform cards with only title/meta/description. There are no bento spans, embedded data previews, table/chart/timeline/document visuals, arrows, or matching section composition.
* What must be rebuilt: port UI Lab `AcademicModules`, `siab2Data.modules`, and preview renderers; preserve bento layout and responsive card behavior.

### Dashboard preview

* What UI Lab has: full browser mockup with top accent line, address pill `Portal SIAB2 — MAN 1 Rokan Hulu`, connected indicator, role tabs (`Admin Madrasah`, `Guru`, `Portal Siswa`, `Kepala Madrasah`), interactive tab content, metric cards, alerts/lists, `StatusBadge`, and mobile 2x2 tabs.
* What current implementation lacks: current dashboard preview is a reduced static shell with role list and three rows. It has no real UI Lab tabs, no animated/interactive role panels, no status badges matching Pass 3, no admin/guru/siswa/kepala content, and no matching mobile layout.
* What must be rebuilt: port UI Lab `DashboardPreview`, `StatusBadge`, dashboard mock data, browser shell styling, tab states, and mobile 2x2 tab layout.

### Parallax

* What UI Lab has: `AcademicParallax` feature storytelling section titled `Buku induk digital madrasah`, six module cards with mini academic previews, staggered/parallax desktop layout, benefit lines, and focused-card lightbox behavior.
* What current implementation lacks: current `/siab2-preview` has no parallax/storytelling section at all.
* What must be rebuilt: add the full UI Lab parallax/feature section. If GSAP ScrollTrigger is required for true fidelity and dependency approval is not available, implement only a visually matching no-motion fallback or mark BLOCKED_FOR_APPROVAL if motion is essential.

### Footer

* What UI Lab has: stats strip, official ticker/marquee, brand block with logo and institutional copy, status chips, navigation column, operator contact card, CTA buttons, and bottom copyright/status strip.
* What current implementation lacks: current footer is a single minimal line with title and preview disclaimer. It lacks stats, ticker, footer grid, contact panel, status chips, CTAs, and bottom strip.
* What must be rebuilt: port UI Lab `StatsSection` and `ContactFooter` layout and visual treatment.

### Mobile

* What UI Lab has: locked responsive screenshots for hero, navbar open, modules, dashboard, and footer at 390px. Mobile keeps the premium cinematic look, centered hero typography, stacked CTAs, status card below hero, 2x2 dashboard tabs, and full-screen drawer overlay.
* What current implementation lacks: current mobile behavior is a generic stacked layout with no UI Lab drawer, no screenshot-matched hero rhythm, no dashboard 2x2 tab grid, no module previews, and no footer structure.
* What must be rebuilt: use `p3_390_hero.png`, `p3_390_navbar_open.png`, `p3_390_modules.png`, `p3_390_dashboard.png`, and `p3_390_footer.png` as hard gates.

## Root Cause

* Previous task prioritized safe scoped implementation over pixel-perfect fidelity.
* UI Lab components were not ported component-by-component.
* Visual acceptance threshold was not strict enough.
* The implementation preserved isolation but did not preserve the approved Pass 3 composition, density, typography, responsive states, or section inventory.
