# Amounts

Rules for how much was eaten: grams, household measures, learned servings, curated portions, quick-amount chips, recent amounts, amount-photo AI estimate.

## Manual gram entry is first-class

Not fallback. Accepting AI value unedited → `quantity_source = ai_estimated`; any edit or direct entry → `manual`. Gemini outage costs one typed number, not a broken app.

## Amount photo (Gemini job 1)

`estimateQuantity` (`app/src/features/quantity/actions/quantity.ts`) returns grams from an amount-used photo. Provider seam `QuantityProvider` in `app/src/lib/quantity/`. MIME type sniffed from bytes (`imageMimeType`), never hardcoded.

### AI-photo consent

One-time consent sheet (`AiConsentSheet`) before first amount photo, and before any lazy-track request. **Verbatim legal copy, never paraphrase.** Per-device, `localStorage` key `levelspoon:ai-photo-consent`. Wording vendor-neutral; naming Google deliberately not required. Server-recorded consent is an M4 item (`docs/ROADMAP.md`).

## Household measure → grams

Pure library `app/src/lib/measures/`, plus learned gram value stored on product row. **Not** AI. Per-product learned density; no user-editable density table, no cross-product inference.

- One *learned* count unit per product: `learnFromServing` records one `serving_unit`/`serving_grams` pair, all a label ever teaches.
- No water-density default: unknown density → `resolveGrams` returns `unresolved`, never assumes `1.0 g/mL`.
- Volume units (`SPOON_UNITS` / `densityUnits`, `available-units.ts`): a unit belongs only if `VOLUME_UNITS_TO_ML` converts it **and** a density is genuinely known. Never seed a density for a dry or loose solid to make a unit appear; give that food a portion in `portions.ts` instead. Seeded loose solids (`isLooseSolid`, `densities.ts`) get spoon units only: a levelled tbsp barely moves with packing, a cup moves a lot. Label-taught density is measured, so it keeps `cup`.

## Portions

A portion is an amount nobody printed on a label: a slice of bread, an EU egg grade, a cup of cooked rice. Curated, not learned. Layers:

- `app/src/lib/measures/portions.ts`: gram figures by portion class. **Every new figure goes here**, never inline at a call site, never in the DB. Each carries a comment naming its source and is edible weight (no shell, no packaging).
- `portion-class.ts`: which class a product is, by `standard_slug` or romanized name. New classes register in both of its tables and in `PortionClass` (`portions.ts`). Cup classes are slug-only: never add one to `NAME_TOKENS_BY_CLASS`. Two name matches means no match.
- `resolve-portions.ts`: **only place portion precedence is decided.** Most specific wins: user override > this product's label > class default. Slug beats name for picking the class. Product whose nutrition basis is not `g` gets no portions. Consumers get a finished `Portion[]` and never re-merge; a new precedence layer goes here, not at a call site.
- `MeasureContext.portions` (`resolve-grams.ts`) is required, never optional. Portions resolve server-side and travel as data on every product DTO (`ProductCandidate`, `StandardFood`, `SelectedProduct`, `MealIngredientDetail`). Never import `portions.ts`, `portion-class.ts` or `resolve-portions.ts` from a client component: the table must not reach the browser bundle.
- `portion_overrides`: per-user grams for one label of one product. **Never write a portion weight to `products`.** Read as correlated `jsonb_object_agg` subquery, never `LEFT JOIN`: one row per label, join multiplies search results.

Re-run `cd app && pnpm run check:portion-classes` after touching `PortionClass`, `CLASS_BY_SLUG`, `NAME_TOKENS_BY_CLASS`, `EXCLUDED_TOKENS_BY_CLASS` or `fixtures/standard-foods.json`. Must exit 0; never silence it. A conflict is a portion chip about to appear on a food nobody measures that way. Fix by excluding a token or mapping the slug, plus a unit test per fix.

## Entry echo and recent amounts

- `meal_ingredients.entry_count` / `entry_unit`: what user said, beside resolved `quantity`/`quantity_unit`. Nullable, no backfill (null pair = row predating the columns). **Nutrition maths reads `quantity` only**; these two are for display and recents. Every write path that saves or edits an amount fills them.
- `quantityText` (`amount-chips.utils.ts`) formats every logged amount ("1 slice · 28 g"). Never format a quantity inline.
- `recentAmounts` (`features/meals/actions/meals.ts`): most recent distinct *amounts* for a product, newest first, soft-deleted rows excluded. Distinct = count and unit together, so 200 g and 250 g are two chips. `RECENT_AMOUNT_LIMIT` (5) decides how many. Never re-resolve weight; it comes off stored `quantity`.

## Chip row

- **One chip row, never two.** New chip source adds a builder to `amount-chips.utils.ts` and merges into the same list (`mergeChips`, recents first). Every chip prints its gram weight. Both amount screens (capture amount step, cooking-fat sheet) render same `AmountChips`.
- **A value gets one control.** `unitsForSelect` drops any unit already offered as a chip from the unit select, keeping only the unit in play so the select can always show its own value.
