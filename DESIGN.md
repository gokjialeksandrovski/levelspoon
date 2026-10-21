# Design

Design system "Warm Tactile Minimal": themes, colour, type, components, motion. Settled; extend it, don't reopen it. Brand personality and anti-references sourced from direct user answers.

## Personality

**Warm & tactile.** A food journal someone keeps by hand: not a spreadsheet, not a game, not a template. Used in short bursts across the day (kitchen, restaurant table, grocery run), often one-handed.

Anti-references (rejected):

- **MyFitnessPal-style spreadsheet**: dense clinical tables, feels like data entry.
- **Duolingo-style gamification**: streaks, mascots, aggressive rewards.
- **Generic AI-slop SaaS**: glassmorphism, purple/gradient accents, rounded cards with icons on top.

## Themes

- Light and dark both real. Default follows `prefers-color-scheme`; **dark is no-preference default** (bare `:root`).
- Header `ThemeToggle` (`components/layout/theme-toggle.tsx`) sets a per-device override: `localStorage` `levelspoon:theme`, applied as `data-theme` on root (`app/src/lib/theme/theme.ts`). Light values live in both the media-query and the attribute blocks of `globals.css`.
- Surfaces: warm cream `--raw-bg: #fdfbf7` light / `#1a1816` dark.

## Colors

- Four accents, each exactly one semantic role, never decorative: paprika `#E05A47` = protein, amber `#E5983B` = carbs, plum `#8B4A62` = fat, matcha `#6E9B66` = log-success state only.
- kcal hero number, weight row and history rail carry no accent.
- Every accent-coded element pairs colour with a redundant non-colour cue.
- No colour token ships without passing computed WCAG/OKLab contrast + distinguishability gate (`app/src/lib/theme/contrast.ts`): accent pairs OKLab distance ≥ 0.05, checked post-theme, never on raw hex.

## Typography

- Bricolage Grotesque (display, headings only) + Karla (body). Hero kcal/macro numerals: Karla + `tabular-nums`.

## Components

- Radii: `--radius-control: 16px`, `--radius-surface: 24px`. Not called "squircle".
- 44px minimum tap targets.
- No modals. `Sheet` (`<dialog>` bottom sheet) is the only overlay.
- Project wrappers over raw HTML: list in CLAUDE.md "Project conventions".

## Motion

One shared recipe: `--ease-out-quart` + `--duration-step: 260ms` (day-view/wizard slide). `motion/react` wrapped app-wide in `MotionConfig reducedMotion="user"` (`app/src/app/providers.tsx`).

Principles:

1. **Motion explains, never decorates.** Every animation is a real thing happening: a number settling, a segment redistributing, an ingredient leaving a list. If it can't be described as "X happened, so Y moved", cut it.
2. **Warmth through craft, not cuteness.** No mascots, no confetti, no bounce/elastic easing.
3. **Extend existing vocabulary** (`--duration-step`, `--ease-out-quart`, existing motion/react surfaces) before inventing new.
4. **Reduced motion absolutely.** Every animation collapses to instant final state via `reducedMotion="user"` / `prefers-reduced-motion`. CSS motion gated behind `prefers-reduced-motion: reduce`.

Numeric defaults (deviate only with a reason):

- Timing: 150–300ms micro-interactions, up to ~400ms orchestrated, never over ~700ms for content checked dozens of times a day.
- Animate `transform` and `opacity` only. Height changes transition `grid-template-rows`, not `height`.
- `ease-out` entering, `ease-in` exiting. Spring (stiffness ~300 / damping ~20) for the one organic moment in a sequence, not every moment.
- Stagger list items 30–50ms. Exits ~60–70% of entrance duration.

Preview motion concepts as live, replayable HTML/CSS artifacts (both themes, reduced-motion toggle), not static storyboard frames; port to `motion/react` once approved.

## Settled, do not re-flag

- **Meal names are "Meal 1", "Meal 2"** (ordinal within local day). Time-of-day names ("Breakfast"/"Dinner") tried and reverted by owner: several meals in one slot all read "Dinner".
- Voice: states facts, never coaches. No streaks, badges, encouragement or shame copy (`PRODUCT.md`).
- No em dashes in UI copy.
