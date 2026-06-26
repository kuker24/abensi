# SIAB2 Pixel-Perfect Port Map

## Status

READY_FOR_REDESIGN_PLANNING

## Principle

Do not reinterpret UI Lab. Port visual structure section-by-section. The target `/siab2-preview` must be a pixel-perfect implementation of Visual Finalization Pass 3, not an inspired-by design, placeholder, or simplified safe card layout.

## Source Inventory

UI Lab source root:

* `/home/fahmi/Downloads/LAB GITHUB/LAB BETA/SIAB2`

Primary source files:

* `src/App.tsx`
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
* `src/index.css`
* `tailwind.config.ts`
* `VISUAL-HANDOFF.md`
* `SIAB2-visual-final-pass3-review.zip`

## Component Mapping

| UI Lab Component     | Target in abensi           | Action                                    |
| -------------------- | -------------------------- | ----------------------------------------- |
| Navbar               | SIAB2PreviewLanding Navbar | Port exact layout                         |
| Hero                 | SIAB2PreviewLanding Hero   | Port exact layout                         |
| Academic status card | Hero status panel          | Port exact layout                         |
| AcademicModules      | Modules section            | Port exact card design                    |
| RoleJourney          | Role journey section       | Port exact layout                         |
| DashboardPreview     | Dashboard preview section  | Port exact visual                         |
| AcademicParallax     | Feature/parallax section   | Port exact or graceful no-motion fallback |
| StatsSection         | Stats area                 | Port exact if present                     |
| ContactFooter        | Footer                     | Port exact layout                         |
| StatusBadge          | Reusable local component   | Port visual style                         |
| GradientButton       | Reusable local component   | Port visual style                         |
| VideoBackground      | Hero background layer      | Port if dependency/asset path approved    |

## Dependency Decision

Do not add GSAP/Framer/hls.js automatically.
First determine:

* Can visual be matched with existing React 18 + CSS/Tailwind?
* Which effects are essential?
* Which effects can be replaced with CSS safely?
* Which dependencies are required for true fidelity?

Current dependency facts:

* UI Lab uses `react@19`, `framer-motion`, `gsap`, `hls.js`, `clsx`, and `tailwind-merge`.
* `abensi/apps/web` currently uses `react@18.3.1`, `react-router-dom`, `lucide-react`, and Tailwind tooling, but does not currently include `framer-motion`, `gsap`, `hls.js`, `clsx`, or `tailwind-merge`.
* No new dependency should be installed during planning.

If dependency is required for fidelity, report BLOCKED_FOR_APPROVAL instead of simplifying design.

## File Strategy

Target files for future redesign:

* `apps/web/src/app/pages/SIAB2PreviewLanding.tsx`
* `apps/web/src/styles.css`
* optional new local preview components under `apps/web/src/app/pages/siab2-preview/`

Recommended future structure if approved:

* `apps/web/src/app/pages/siab2-preview/siab2Data.ts`
* `apps/web/src/app/pages/siab2-preview/Navbar.tsx`
* `apps/web/src/app/pages/siab2-preview/Hero.tsx`
* `apps/web/src/app/pages/siab2-preview/AcademicModules.tsx`
* `apps/web/src/app/pages/siab2-preview/RoleJourney.tsx`
* `apps/web/src/app/pages/siab2-preview/DashboardPreview.tsx`
* `apps/web/src/app/pages/siab2-preview/AcademicParallax.tsx`
* `apps/web/src/app/pages/siab2-preview/StatsSection.tsx`
* `apps/web/src/app/pages/siab2-preview/ContactFooter.tsx`
* `apps/web/src/app/pages/siab2-preview/StatusBadge.tsx`
* `apps/web/src/app/pages/siab2-preview/GradientButton.tsx`

Do not touch:

* backend/API
* auth
* database
* migrations
* `.env`
* dashboard real pages
* `/login`
* role redirects

## Implementation Sequence for Future Approval

1. Copy/translate UI Lab data model and local reusable preview components into isolated `/siab2-preview` files.
2. Rebuild `SIAB2PreviewLanding.tsx` to render the exact UI Lab sequence: `Navbar`, `Hero`, `AcademicModules`, `RoleJourney`, `DashboardPreview`, `AcademicParallax`, `StatsSection`, `ContactFooter`.
3. Port only the CSS/Tailwind tokens required for `.siab2-preview` isolation while preserving Pass 3 typography, colors, spacing, borders, shadows, and responsive behavior.
4. Preserve existing public route handling for `/siab2-preview`; do not change auth, login, or role redirects.
5. Run local visual capture and compare against required screenshots before any commit.
6. If visual match is below 90–95%, mark NEEDS FIX and continue iteration; do not commit.
7. If dependency fidelity is blocked, mark BLOCKED_FOR_APPROVAL and ask user before installing anything.

## Visual Gate

Before commit, capture:

* `redesign_1440_hero.png`
* `redesign_1440_modules.png`
* `redesign_1440_dashboard.png`
* `redesign_1440_parallax.png`
* `redesign_1440_footer.png`
* `redesign_390_hero.png`
* `redesign_390_navbar_open.png`
* `redesign_390_modules.png`
* `redesign_390_dashboard.png`
* `redesign_390_footer.png`

Compare against:

* `p3_1440_hero.png`
* `p3_1440_modules.png`
* `p3_1440_dashboard.png`
* `p3_1440_parallax.png`
* `p3_1440_footer.png`
* `p3_390_hero.png`
* `p3_390_navbar_open.png`
* `p3_390_modules.png`
* `p3_390_dashboard.png`
* `p3_390_footer.png`

## Failure Rule

If design does not match source screenshots, do not commit. Mark NEEDS FIX.

If a required visual effect cannot be achieved without an unapproved dependency, do not substitute a simplified design. Mark BLOCKED_FOR_APPROVAL.
