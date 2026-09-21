# Toolbox

Every file, script, or document an agent produces gets one entry here, plus
a line appended to each downstream playbook's `## Toolbox` block.

Entry carries three things: path, what it is, RULE. RULE is binding on every
later playbook. Agent that ignores a RULE and rewrites an existing tool has
failed its task even if tests pass.

Appending here is a numbered step in every playbook's final task. Not
optional, not "if time permits".

## Format

```markdown
### <name>
`<path>`
<one line: what it is>
RULE: <what later work must do, imperative>
Added by: <playbook filename>
```

---

## Entries

### portions.ts
`app/src/lib/measures/portions.ts`
Gram figures for household portions, keyed by portion class.
RULE: every new portion figure goes in this file. Never inline a gram number
at a call site, never move these into the database. Each figure carries a
comment naming its source. Figures are edible portion, never shell or
packaging weight.
Added by: 2026-09-18-01-portion-engine.md

### MeasureContext.portions
`app/src/lib/measures/resolve-grams.ts`
Required field carrying the portions a given user should see for a product.
RULE: resolve portions server-side and pass them in. Never import
`portions.ts` from a client component - the table must not reach the browser
bundle. Never make this field optional.
Added by: 2026-09-18-01-portion-engine.md

### portion-class.ts
`app/src/lib/measures/portion-class.ts`
Slug and romanized-name lookup for a product's portion class.
RULE: new portion classes are registered in this file's two tables, and in
`PortionClass` in `portions.ts`. Cup classes are slug-only - never add a cup
class to `NAME_TOKENS_BY_CLASS`. Two name matches means no match.
Added by: 2026-09-18-02-portion-class-resolution.md

### resolve-portions.ts
`app/src/lib/measures/resolve-portions.ts`
Merges class defaults, the product's own serving weight and per-user overrides.
RULE: this is the only place portion precedence is decided. A consumer
receives a finished `Portion[]` and never re-merges. Anything needing a new
precedence layer adds it here, not at a call site.
Added by: 2026-09-18-02-portion-class-resolution.md

### check-portion-classes
`app/scripts/check-portion-classes.ts` - `cd app && npm run check:portion-classes`
Runs both class-resolution routes over all 212 curated foods and fails on any
name match that contradicts the curated table.
RULE: re-run this after ANY change to `PortionClass`, `CLASS_BY_SLUG`,
`NAME_TOKENS_BY_CLASS`, `EXCLUDED_TOKENS_BY_CLASS` or
`fixtures/standard-foods.json`. It must exit 0. Never silence it - a conflict
is a portion chip about to appear on a food nobody measures that way. Fix by
excluding a token or by mapping the slug, and add a unit test for each fix.
Added by: 2026-09-18-02-portion-class-resolution.md

### ProductCandidate.portions / StandardFood.portions / SelectedProduct.portions
`app/src/features/products/actions/products.ts`, `app/src/app/(app)/meals/[mealId]/capture/capture-wizard.types.ts`
Server-resolved portions carried to the client on every product DTO, and on
`MealIngredientDetail` so an already-logged amount stays editable in its own
unit.
RULE: resolve on the server, pass down as data. Never import `portions.ts`,
`portion-class.ts` or `resolve-portions.ts` from a client component.
Added by: 2026-09-18-02-portion-class-resolution.md

### amount-chips.tsx / amount-chips.utils.ts
`app/src/app/(app)/meals/[mealId]/amount-chips.tsx`, `...amount-chips.utils.ts`
Tappable quick-amount row, and the pure builders behind it.
RULE: one chip row, never two. A new chip source adds a builder to
`amount-chips.utils.ts` and merges into the same list - never a second row and
never a second component. Every chip prints its gram weight.
Added by: 2026-09-18-03-portion-chip-row.md

### typedUnits filter
`app/src/app/(app)/meals/[mealId]/capture/steps/amount-step.tsx`
Drops any unit already offered as a chip from the unit select, keeping only
the unit currently in play so the select can always show its own value.
RULE: a value gets one control. Anything that adds a chip must stay out of
the select, and anything added to the select must not also be a chip.
Added by: 2026-09-18-03-portion-chip-row.md

### portion_overrides + portions.ts actions
`app/src/lib/db/schema/nutrition.ts`, `app/src/features/products/actions/portions.ts`
Per-user gram figure for one named portion of one product.
RULE: never write a portion weight to `products`. A per-label override is a
correlated `jsonb_object_agg` subquery, never a LEFT JOIN - this table is one
row per label and a join multiplies search results.
Added by: 2026-09-18-04-portion-grams-override.md

### meal_ingredients.entry_count / entry_unit
`app/src/lib/db/schema/nutrition.ts`
Echo of what the user entered, beside the canonical resolved quantity.
RULE: nutrition maths reads `quantity`/`quantity_unit` only. These two are for
display and for recents. Every write path that saves or edits an amount fills
them - a null pair means a row predating this column, not an empty entry.
Added by: 2026-09-18-05-recent-amounts.md

### recentAmounts
`app/src/features/meals/actions/meals.ts`
Two most recent distinct units for a product, newest first.
RULE: one chip per unit, `RECENT_AMOUNT_LIMIT` decides how many. Soft-deleted
meals and ingredients are excluded. Never re-resolve the weight - it comes off
the stored `quantity`.
Added by: 2026-09-18-05-recent-amounts.md

### quantityText
`app/src/app/(app)/meals/[mealId]/amount-chips.utils.ts`
Formats a logged amount in the words it was entered in.
RULE: every screen showing a logged amount uses this, so "1 slice · 28 g"
reads the same everywhere. Never format a quantity inline.
Added by: 2026-09-18-05-recent-amounts.md

### SPOON_UNITS / densityUnits
`app/src/lib/measures/available-units.ts`, `isLooseSolid` in `densities.ts`
Volume units offered when a product's density is known.
RULE: a unit belongs here only if `VOLUME_UNITS_TO_ML` can convert it AND a
density is genuinely known. Never seed a density for a dry or loose solid to
make a unit appear - give that food a portion with a measured gram weight in
`portions.ts` instead. A seeded loose solid gets the spoon units only: a
levelled tbsp barely moves with packing, a cup moves a lot. A label-taught
density is measured, so it keeps cup.
Added by: 2026-09-18-06-cup-measure.md

### weight.utils.ts
`app/src/features/weight/actions/weight.utils.ts`
Every weight figure, rail share, cadence date and countdown, as pure functions.
RULE: all weight maths goes here, never in a component and never in a Server
Action body. This file must never import from `features/goals/` and must never
compute, mention or return a calorie figure — the weight goal carries no
arithmetic to or from `daily_calorie_goal`. A new progress shape adds a variant
to `WeightProgress`, not a second progress function.
RULE: every stored figure is kg. `toKg`/`fromKg`/`displayWeight` are the only
conversions, and a figure is rounded **once**, at the copy layer, in the unit
it prints in — rounding in kg first moves a pound reading to a pound nobody
typed. A new preset row is a step constant plus `presetsFrom`, so each unit
gets its own round numbers; never convert the kilogram row.
Added by: 2026-09-21-weight-goal.md (units and free ranges 2026-09-21)

### weight_goals / weight_entries
`app/src/lib/db/schema/weight.ts`
One goal row per user; one weight reading per user per local calendar day.
RULE: readings are keyed by the user's **local** day, derived server-side from
a browser timezone — never a server UTC day, never a client-supplied date. The
unique index is the one-reading-per-day rule: re-logging a day replaces it,
never appends. Deleting a goal leaves the readings. All three CHECK constraints
on `weight_goals` are load-bearing; a mode's fields are all-or-nothing and a
cadence is at least one day.
RULE: weight columns are `numeric` at two decimals and hold kg, whatever unit
the user chose. The display unit is `users.weight_unit` — one field, no
cross-field invariant, so it is a column on `user` and not a table.
Added by: 2026-09-21-weight-goal.md (units and free ranges 2026-09-21)

### WeightRow / weight-row.utils.ts
`app/src/app/(app)/day/[date]/weight-row.tsx`, `...weight-row.utils.ts`
The home page's weight line, its rail, its expanded panel and its weigh-in
prompt, plus the pure copy builders behind them.
RULE: one line plus one rail at rest, quieter than `DayMacros`, and no accent
colour inside the block. Copy comes from the spec's copy table via these
builders — never format a weight figure inline, and every builder takes the
display unit. No line may state a verdict on the user's pace. Shown on today
only.
RULE: `danger` appears on exactly one control — the armed `Delete` in the
expanded panel, and only while armed. Arming fires no request and `Cancel`
un-arms it. The setup sheet carries no destructive control.
Added by: 2026-09-21-weight-goal.md (delete moved out of the sheet 2026-09-21)

