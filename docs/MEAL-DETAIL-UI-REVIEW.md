# Meal Detail — UI Review

Critique of meal detail screen (`app/src/app/(app)/meals/[mealId]/`), against
`ui-ux-pro-max` checklist + `.impeccable.md` design principles. Grounded in
code (`meal-detail.tsx`, `ingredient-row.tsx`, `macro-line.tsx`, `button.tsx`,
`cooking-fat-control.tsx`, `icon-provider.tsx`), not screenshot guesswork.
Nothing fixed yet — backlog only.

OCR unit-token misrecognition ("1 bas" vs "1 bar") tracked separately in
`docs/KNOWN-ISSUES.md` — different root cause (PaddleOCR), not a UI issue.

## P0 — motion (`.impeccable.md`'s own named gap)

`.impeccable.md` calls meal detail one of two "zero-animation" surfaces and
names exact fixes needed: "a number settling," "an ingredient leaving a
list." Current code still misses both.

1. **Remove ingredient snaps, no exit.** `removeIngredient` →
   `router.refresh()` → full remount. Row vanishes instant, no
   slide/fade-out. Direct violation of Principle 1's own example.
2. **Meal total snaps, no settle.** Edit/remove triggers refetch; `Meal
   total` kcal + P/C/F jump to new value with no transition. Second
   Principle-1 example, also unmet.
3. **List entrance is one block-fade, not per-row stagger.**
   `MealDetailBody` wraps whole content in single `motion.div` fade. Motion
   Rules spec 30–50ms stagger per list item — not applied. Reads as less
   flat, not real craft yet.

Fix direction: `AnimatePresence` + `layout` on `<li>` rows for exit, animate
total via key-diffed number transition, stagger `IngredientRow` mount with
existing `--duration-step`/spring vocab. All within already-approved motion
recipe — no new vocabulary needed.

## P1 — bugs

4. **Button height mismatch: `Add ingredient` vs `Add cooking oil or fat`.**
   `icon-provider.tsx:9` sets global Phosphor default `size: 22`.
   `Add ingredient` (`meal-detail.tsx:140`) is text-only, `text-sm` → 20px
   line-height. `Add cooking oil or fat`
   (`cooking-fat-control.tsx:320-322`) renders `<DropIcon />` with no `size`
   override → 22px, 2px taller than the text line beside it in the same
   `items-center` flex row. Both share identical `py-3` padding
   (`button.tsx:50`):
   - text-only: 24px padding + 20px line = 44px
   - icon+text: 24px padding + 22px icon = 46px

   Other icon call sites (`photo-input.tsx`, `day-empty-state.tsx`,
   `product-name-step.tsx`) all pass explicit `size={24}`/`size={32}`
   standalone, not inline-with-text — collision is unique to
   `CookingFatControl`. Fix: pass `size={20}` (or fixed `size-5` box) on
   `DropIcon` to match `text-sm`'s 20px line-height. Don't touch global
   default (other call sites rely on 22px working fine standalone).

5. **Header → first product gap: triple stack, 56px, unmarked.**
   `main` → `py-6` (24px) → `IngredientList` `ul.mt-4` (16px) → first
   `IngredientRow` `li.py-4` (16px top) = 56px before "Yogurt blends snack",
   with nothing marking it as a section start (no rule/border, unlike
   `MealTotal`'s `border-t-2` which justifies its own ~52px gap as a marked
   break). Two gaps end up nearly the same size — one marked, one not — so
   the unmarked one reads as accidental.

   Root cause: `ul`'s `mt-4` is redundant. First `li`'s own `py-4` already
   provides top spacing; `mt-4` exists to space the list from what precedes
   it, but `py-4` was written for inter-row rhythm (paired with `divide-y`)
   and fires on row 1 too — Tailwind has no "not first" scoping here, so
   both stack.

   Fix: drop `ul`'s `mt-4`. Let `main`'s `py-6` + first-row's `py-4`
   (24+16=40px) be the whole gap — or scope divider padding so `divide-y`
   supplies inter-row space and `py-4` doesn't double as row-padding *and*
   list-top-padding.

## P2 — visual consistency

6. **Casing inconsistent: "Yogurt blends snack" vs "SNICKERS BAR".**
   All-caps product name reads clinical/shouty, works against "warm,
   hand-kept journal" brand personality (explicit anti-reference in
   `.impeccable.md`: no MyFitnessPal-clinical feel). Likely raw stored
   string rendered verbatim. Suggest normalize display casing at render,
   leave stored value alone.

7. **Per-row kcal shares weight/color with quantity.**
   `200 g · 470 kcal` — kcal is the number scanned repeatedly, but shares
   muted-gray/same-weight treatment as the count. `Meal total` gives kcal
   bold treatment; row level doesn't. Not asking for spreadsheet columns
   (sentence style is deliberate, correctly avoids clinical-table
   anti-pattern) — just weight, not a new color.

8. **`Add ingredient` wants icon.** User feedback: primary CTA feels empty
   next to `Add cooking oil or fat`, which carries `DropIcon`
   (`cooking-fat-control.tsx:320-322`). Both are top-level meal actions at
   the same hierarchy level — one iconless, one not, reads unbalanced.
   Fix direction: pick an icon reading as "add ingredient" (plus/fork-knife/
   carrot-family — `CarrotIcon` already used elsewhere in this feature,
   `capture/steps/product-name-step.tsx`), pass explicit `size` matching
   `text-sm` line-height (20px) same as item 4's fix, don't inherit the
   22px global default inline with text.

## Full spacing audit

Scale in use: 4 / 8 / 12 / 16 / 24px (`gap-1`, `gap-2`, `gap-3`, `mt-1`,
`mt-4`/`py-4`, `mt-6`/`py-6`/`pt-3`) — consistent 4px-multiple system
throughout, no arbitrary values found.

| Transition | Spacing | Verdict |
|---|---|---|
| Header → first product | 24+16+16=56px, unmarked | **Bug** — triple stack, item 5 |
| Within a row (name → qty/macro → correction link) | `gap-2` (8px) between blocks, `gap-1` (4px) qty↔macro, `mt-1` (4px) to correction link | Fine — tight, deliberate hierarchy |
| Row → row | `divide-y` + `py-4` (16px each side = 32px effective) | Fine, matches list rhythm elsewhere |
| Last row → Meal total | `py-4`(16) + `mt-6`(24) + `pt-3`(12) ≈ 52px, marked by `border-t-2` | Fine — semantic break earns the size |
| Meal total → action buttons | `mt-6` (24px) | Fine, matches other section gaps |
| Between action buttons | `gap-3` (12px) | Fine, matches touch-spacing min (8px+) |

Only the top-of-page stack is the outlier. Rest already holds a coherent
rhythm — don't touch it.

## Checked, no issue (verified via code, not assumed)

- Touch targets: `Edit`/`Remove` links use negative-margin hit-area trick,
  land on 44px floor — compliant.
- Destructive action: `Remove` red text + confirm `Sheet` before mutation —
  satisfies color-not-only and confirmation-dialog rules.
- `Delete meal` spatially/stylistically separated from primary actions —
  satisfies destructive-nav-separation.
- One primary CTA (`Add ingredient`, filled) vs secondary outline (`Add
  cooking oil or fat`) — satisfies single-primary-action rule.
- Color contrast: gated by project's own `contrast.ts` WCAG check — not
  re-litigating, per `.impeccable.md`: palette "settled, not reopened."

## Status

Nothing fixed. Cheapest wins if picked up: item 4 (one-line `size={20}`
prop) and item 5 (delete one class). Item 6/7 are one-line render tweaks.
Item 8 needs an icon choice, then same one-line `size` treatment as item 4.
P0 motion items are the real work — `.impeccable.md` already names them as
outstanding, not new scope.
