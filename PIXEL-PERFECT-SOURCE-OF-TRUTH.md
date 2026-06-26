# SIAB2 Pixel-Perfect Source of Truth

## Visual Source

Visual Finalization Pass 3 adalah standar utama dan source of truth untuk redesign `/siab2-preview`. Implementasi di repo `abensi` harus mengikuti UI Lab di:

* UI Lab root: `/home/fahmi/Downloads/LAB GITHUB/LAB BETA/SIAB2`
* Screenshot package: `/home/fahmi/Downloads/LAB GITHUB/LAB BETA/SIAB2/SIAB2-visual-final-pass3-review.zip`
* Visual handoff: `/home/fahmi/Downloads/LAB GITHUB/LAB BETA/SIAB2/VISUAL-HANDOFF.md`
* UI Lab source code: `/home/fahmi/Downloads/LAB GITHUB/LAB BETA/SIAB2/src`
* UI Lab global styling: `/home/fahmi/Downloads/LAB GITHUB/LAB BETA/SIAB2/src/index.css`
* UI Lab Tailwind config: `/home/fahmi/Downloads/LAB GITHUB/LAB BETA/SIAB2/tailwind.config.ts`

The implementation must not create a new visual direction. It must port the approved Pass 3 visual structure and behavior as closely as possible.

## Required Reference Screenshots

These screenshots are required visual gates for the redesign:

* `SIAB2-visual-final-pass3-review.zip::p3_1440_hero.png`
* `SIAB2-visual-final-pass3-review.zip::p3_1440_modules.png`
* `SIAB2-visual-final-pass3-review.zip::p3_1440_dashboard.png`
* `SIAB2-visual-final-pass3-review.zip::p3_1440_parallax.png`
* `SIAB2-visual-final-pass3-review.zip::p3_1440_footer.png`
* `SIAB2-visual-final-pass3-review.zip::p3_1920_hero.png`
* `SIAB2-visual-final-pass3-review.zip::p3_1920_top_to_mid.png`
* `SIAB2-visual-final-pass3-review.zip::p3_390_hero.png`
* `SIAB2-visual-final-pass3-review.zip::p3_390_navbar_open.png`
* `SIAB2-visual-final-pass3-review.zip::p3_390_modules.png`
* `SIAB2-visual-final-pass3-review.zip::p3_390_dashboard.png`
* `SIAB2-visual-final-pass3-review.zip::p3_390_footer.png`

Additional screenshots found in the same package may be used for responsive checks:

* `p3_768_modules.png`
* `p3_768_hero.png`
* `p3_768_dashboard.png`
* `p3_430_hero.png`
* `p3_360_hero.png`
* `p3_1366_hero.png`
* `p3_1366_dashboard.png`

## UI Lab Source Components

The redesign should use these UI Lab components as the visual source, not as vague inspiration:

* `src/components/Navbar.tsx`
* `src/components/Hero.tsx`
* `src/components/AcademicModules.tsx`
* `src/components/RoleJourney.tsx`
* `src/components/DashboardPreview.tsx`
* `src/components/AcademicParallax.tsx`
* `src/components/StatsSection.tsx`
* `src/components/ContactFooter.tsx`
* `src/components/StatusBadge.tsx`
* `src/components/GradientButton.tsx`
* `src/components/VideoBackground.tsx`
* `src/data/siab2Data.ts`
* `src/hooks/useHlsVideo.ts`
* `src/hooks/usePrefersReducedMotion.ts`
* `src/lib/cn.ts`

## Locked Visual Requirements

* Dark premium cinematic academic design
* SIAB2 title and subtitle
* MAN 1 Rokan Hulu logo
* Accent gradient `#89AACC → #4E85BF`
* Inter body
* Instrument Serif only for display emphasis
* Hero with real academic product feeling
* Status card in hero
* Modules section with clear card previews
* Dashboard preview section
* Parallax/feature storytelling
* Footer matching locked design
* Mobile layout matching locked screenshots

## Not Allowed

* Placeholder version
* Simplified version
* Inspired-only version
* Orange-dominant theme
* Portfolio style
* Generic SaaS template
* Removing major sections
* Replacing design with basic scoped CSS card layout

## Acceptance Standard

Visual output must match UI Lab Pass 3 by at least 90–95%. If not, status must be NEEDS FIX or BLOCKED.
