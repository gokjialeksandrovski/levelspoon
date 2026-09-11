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
// list rows below relied on the browser's own thin 1px square outline
// instead. For genuinely box-shaped controls only (icon targets, list
// rows, the macro toggle) - see TEXT_LINK_RING for inline links.
export const FOCUS_RING =
  "rounded-(--radius-control) focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text";

// The hit box and the visible ring have different jobs. The hit box is 44px
// (via -my-N/py-N) and may overlap its neighbours invisibly; but drawing
// the ring on that box turns it into a pill that collides with the row
// above (found via /critique, 2026-09-10). So the ring is drawn on the
// direct child <span> instead, where it hugs the actual text. Every
// consumer of TAP_HIT_AREA_* wraps its label in a <span>.
const TEXT_LINK_RING =
  "focus-visible:outline-none [&:focus-visible_span]:outline [&:focus-visible_span]:outline-2 [&:focus-visible_span]:outline-offset-2 [&:focus-visible_span]:outline-text [&:focus-visible_span]:rounded-xs";

export const TAP_HIT_AREA_SM = `-my-3 -mx-1 px-1 py-3 ${TEXT_LINK_RING}`;
export const TAP_HIT_AREA_XS = `-my-3.5 -mx-1 px-1 py-3.5 ${TEXT_LINK_RING}`;

// The app's one recurring secondary affordance: a bare underlined text button
// in the muted color with the SM hit-area recipe already applied - "None of
// these", "Change?", "Enter the name/values manually instead". Wrap the label
// in a <span> (TAP_HIT_AREA_SM draws its focus ring on the child span).
export const TEXT_LINK_SM = `${TAP_HIT_AREA_SM} text-sm text-text-muted underline`;

// For icon-only controls (AppHeader's day-nav/history/back, AccountMenu,
// WizardShell's back) - real padding, not the negative-margin trick above,
// because these sit in headers with height and width to spare (h-16, a
// px-4 row), so growing the actual box costs nothing and avoids two
// adjacent 44px hit-areas silently overlapping the way a margin-canceled
// pair packed at gap-1 would (found via ui-ux-pro-max review, 2026-09-10).
// size-11 lands exactly on the 44px floor (11 * 4px).
export const ICON_TAP_TARGET_CLASS = `flex size-11 items-center justify-center ${FOCUS_RING}`;

// An icon centred in its 44px box floats (44-22)/2 = 11px inside the box, so
// the leading/trailing control of a header row ends up inset from the page's
// px-4 content column - the day carets sat ~11px right of the kcal figure
// below them (found via /layout, 2026-09-10). Pull the whole edge group out
// by that 11px so its outer glyph lands on the column, without touching the
// box size or the gap between icons within the group (an earlier attempt
// that only re-justified the outer icon widened that gap instead - found via
// /critique, 2026-09-10). LEFT for a group hugging the left margin, RIGHT
// for the right.
export const ICON_ROW_EDGE_PULL_LEFT = "-ml-[11px]";
export const ICON_ROW_EDGE_PULL_RIGHT = "-mr-[11px]";
