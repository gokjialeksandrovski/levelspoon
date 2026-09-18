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
