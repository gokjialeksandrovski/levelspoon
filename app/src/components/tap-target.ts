// app/src/components/tap-target.ts
//
// Shared negative-margin-canceled padding recipe for underlined text
// links/buttons that must clear ui-ux-pro-max's 44px touch-target floor
// without growing the row around them - the technique ingredient-row.tsx
// introduced for its Edit/Remove actions (/critique, 2026-09-09), now
// needed by every other bare underlined link in the app (day view,
// capture wizard) once the same review was applied everywhere rather than
// just there (found via /critique + ui-ux-pro-max review, 2026-09-10).
//
// Two variants because the app's underlined links come in two text sizes
// with different line-heights, each solved for the same 44px floor:
// text-sm's 20px line-height needs py-3 (12*2+20=44, matching Button's own
// math); text-xs's 16px line-height needs py-3.5 for the same floor
// (14*2+16=44).

// The branded focus-visible ring that Button and Field already carry: a 2px
// outline in the theme's text color, offset 2px, on the control's rounded
// box. Centralised here so every interactive surface in the app agrees -
// before the /accessibility pass (2026-09-10) the header icons and the
// text links below relied on the browser's own thin 1px square outline
// instead, and elements built ad-hoc (the macro toggle, meal-list rows)
// still did.
export const FOCUS_RING =
  "rounded-(--radius-control) focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text";

export const TAP_HIT_AREA_SM = `-my-3 -mx-1 px-1 py-3 ${FOCUS_RING}`;
export const TAP_HIT_AREA_XS = `-my-3.5 -mx-1 px-1 py-3.5 ${FOCUS_RING}`;

// For icon-only controls (AppHeader's day-nav/history/back, AccountMenu,
// WizardShell's back) - real padding, not the negative-margin trick above,
// because these sit in headers with height and width to spare (h-16, a
// px-4 row), so growing the actual box costs nothing and avoids two
// adjacent 44px hit-areas silently overlapping the way a margin-canceled
// pair packed at gap-1 would (found via ui-ux-pro-max review, 2026-09-10).
// size-11 lands exactly on the 44px floor (11 * 4px).
export const ICON_TAP_TARGET_CLASS = `flex size-11 items-center justify-center ${FOCUS_RING}`;

// Edge variants: on a control at the very start or end of a header row,
// justify-center leaves the 22px glyph floating (44-22)/2 = 11px inside the
// 44px box, so it sits inset from the page's px-4 content column - the day
// label carets ended up ~11px right of the kcal figure and body text below
// them (found via /layout, 2026-09-10). These pin the glyph to the box edge
// that faces the page margin so it lines up with the content column; the
// 44px hit area is unchanged, it just extends inward, away from the screen
// edge (the safe direction). LEADING for the left end of a row, TRAILING
// for the right.
export const ICON_TAP_TARGET_LEADING = `flex size-11 items-center justify-start ${FOCUS_RING}`;
export const ICON_TAP_TARGET_TRAILING = `flex size-11 items-center justify-end ${FOCUS_RING}`;
