// Negative-margin-canceled padding for underlined links to clear the 44px
// touch-target floor without growing their row.
// Two variants for the app's two text sizes: text-sm (20px line-height)
// needs py-3, text-xs (16px) needs py-3.5 - both land on 44px.

// Branded focus-visible ring (2px outline, theme text color) shared by
// Button/Field, centralised so every interactive surface agrees. For
// box-shaped controls only - see TEXT_LINK_RING for inline links.
export const FOCUS_RING =
  "rounded-(--radius-control) focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text";

// Ring drawn on the child <span>, not the 44px hit box: the hit box may
// overlap neighbours invisibly, but a ring on it would collide with the
// row above. Every TAP_HIT_AREA_* consumer wraps its label in a <span>.
const TEXT_LINK_RING =
  "focus-visible:outline-none [&:focus-visible_span]:outline [&:focus-visible_span]:outline-2 [&:focus-visible_span]:outline-offset-2 [&:focus-visible_span]:outline-text [&:focus-visible_span]:rounded-xs";

export const TAP_HIT_AREA_SM = `-my-3 -mx-1 px-1 py-3 ${TEXT_LINK_RING}`;
export const TAP_HIT_AREA_XS = `-my-3.5 -mx-1 px-1 py-3.5 ${TEXT_LINK_RING}`;

// Recurring secondary affordance: muted underlined text button with the SM
// hit-area applied. Wrap the label in a <span> for the focus ring.
export const TEXT_LINK_SM = `${TAP_HIT_AREA_SM} text-sm text-text-muted underline`;

// Real padding (not the negative-margin trick above) for icon-only header
// controls, which have room to spare - avoids adjacent hit-areas overlapping.
// size-11 lands on the 44px floor (11 * 4px). hover:bg makes the full 44px
// box visibly respond so the tap target reads as a real button, not empty
// space around a small glyph.
export const ICON_TAP_TARGET_CLASS = `flex size-11 items-center justify-center rounded-(--radius-control) transition-colors hover:bg-surface-raised ${FOCUS_RING}`;

// An icon centred in its 44px box floats 11px ((44-22)/2) inside it, so a
// header row's edge icons sit inset from the px-4 content column. Pulls the
// whole edge group out by 11px without touching icon spacing within it.
// LEFT for the left margin, RIGHT for the right.
export const ICON_ROW_EDGE_PULL_LEFT = "-ml-[11px]";
export const ICON_ROW_EDGE_PULL_RIGHT = "-mr-[11px]";
