# Meals

Rules for history page, recipes and lazy track. Day model (`meals.log_date`, local day) is in `docs/ARCHITECTURE.md` "Time model".

## History

One row per day user logged, newest first, paged at `HISTORY_PAGE_SIZE`. `history.utils.ts` shapes rows; query stays one row per logged day.

- **Days between two loaded rows put back client-side** (`withUnloggedDays`), never by query. Up to `MAX_GAP_FILL_DAYS` blank days list one row each and link to that day: a missed day is somewhere to go, not a hole. Longer stretch collapses to one non-linking row. Nothing filled above newest row or below oldest: first is the day user came from, second may be next page.
- Rows group by month (`toHistoryMonths`), sticky heading, year dropped inside current year.
- Rail on a logged row is day hero `CalorieBar` pair one tier quieter (`h-1`, `bg-border` track, `bg-text` fill, `danger` at or past goal). Drawn only with a kcal goal, `role="presentation"`: every figure it encodes is printed above it. No accent colour: four accents each own a macro, a day's kcal is not one.
- **Today row says `so far`, never "under goal"**: a day still being eaten is not a day under its goal.
- **Week summary** (`weekSummary`) on top: last 7 days ending yesterday, one tile per day (`bg-border` blank, `bg-text` logged, `danger` over goal), "N of 7 logged", average of logged days and its distance from goal. Today left out, same reason as `so far`. Window starts at first day ever logged when there is no older page: days before app use are not missed. Under/over is `calorieRemaining`'s own split, no tolerance band (a "close enough" band would be app judging the day). Copy says "a logged day" because average of days logged is not average of days that passed.

## Recipes

A recipe is a meal the user saved to re-add later, private to that user. Two surfaces, both existing screens: meal page (`Save as recipe`, becomes `Edit this recipe` once linked) and capture wizard options screen (`Add a meal` section). **No standalone recipes page**: the picker is the only surface.

- Vocabulary is **recipe** in every line of UI copy, never "saved meal". Section title `Add a meal` is the one exception: names what user adds, not what is stored.
- **`recipes` and `recipe_items` hold amounts, never nutrition.** Every total reads live through `effectiveNutrition`, so a corrected label figure or per-user override moves every recipe with no migration.
- Shared nutrition maths (`ZERO_NUTRITION`, `addNutrition`, `ProductNutritionRow`, `productRowToNutritionValues`) lives in `app/src/lib/nutrition/totals.ts`, not `meals.ts`: `meals.ts` is `"use server"` and may export only async functions.
- **Divergence computed, never stored.** `mealMatchesRecipe` (`features/recipes/actions/recipes.utils.ts`) compares a meal's live rows against `recipe_items` as a **multiset** (a meal can hold two rows of one product), tolerance below `numeric(10,2)` scale. Retro-update eligibility uses `mealMatchesRecipe` alone (exact multiset equality). Red divergence line additionally requires `recipeIsSubsetOfMeal` false, suppressing it when a recipe is picked into a meal already holding other food. A stored boolean would need clearing and setting by every ingredient write path.
- **Retro-update is wholesale, today only, offered only where harmless.**
  - Today-only enforced in the **action**, not the store: guard `meal.logDate !== todayLocalDateString(timezone)`, same helper `createMeal`/`getDayLog` use.
  - `earlierMealsFromRecipe(mealId, timezone)` and `saveRecipeEdit(mealId, draft, mode, timezone)` take `timezone` as **required** trailing param, no default: a default would silently reopen the past-day hole. Callers pass `Intl.DateTimeFormat().resolvedOptions().timeZone`.
  - Only earlier meals still identical to old recipe can be ticked, so rewrite destroys nothing of user's own. Recipe's origin meal offered on same terms as any sibling.
  - Diverged meal is named in prompt, left alone, and carries `InlineMessage tone="error"` on its own page until user acts.
  - **Server re-checks at save time; never trusts the tick.**
- `meals.recipe_id` nullable, no cascade. `deleteRecipe` runs `unlinkMealsFromRecipe` then `softDeleteRecipe` in one transaction: meal keeps every ingredient, loses only subtitle and button. **Latest wins**: second recipe entered into one meal replaces the link.
- `enterRecipe` writes `quantity_source = 'manual'` and **re-reads `quantity_unit` from product**, never from `recipe_items`: same call-site enforcement as `saveMealIngredient`.
- Edit sheet draft amount is typed text: `DraftRow.quantity` is `string`, parsed at commit (same as `ingredient-row.tsx`), so decimals are typable. `AmountRow.quantity` stays `number`: type that crosses to actions.
- No unique constraint on `(user_id, name)`. Two recipes called "Oats" are user's business, told apart by kcal and macro line in picker.
- Refusals cross as `SaveRecipeResult` / `EnterRecipeResult` / `SaveRecipeEditResult`, never thrown classes. Each union's `failed` variant declared but never constructed: actions map named errors and rethrow anything else, so a DB failure reaches client as bare `Error`. Both sheets carry a real `catch`, not just the union arm.
- Imports: `meals → recipes` (store and utils only, never the `"use server"` module) and `recipes → lib` only. `recipes.store.ts` carries no `"use server"`.
- Spec: `docs/superpowers/specs/2026-09-24-recipes-design.md`.

## Lazy track (Gemini job 2)

Least accurate logging path, on purpose: user describes meal (+ optional photo), Gemini returns itemized estimate (`estimateMeal`, `features/lazy-track/actions/lazy-track.ts`: meal name, items, grams, eight per-100g figures), user fixes grams, logs. Reached from wizard `Add a meal` section.

- **Guesses are private `products` rows**, `nutrition_origin = 'ai_estimate'`.
  - `products_ai_estimate_private` CHECK forbids label photo and `standard` source.
  - `assertNotAiEstimate` guards `linkBarcode` and `setPortionGrams`.
  - `notAiEstimate` fragment keeps them out of `searchUserProducts`, `matchProduct`, `findSameFigures`, `assertUserProduct`, `findStoredMeasures`.
  - `isProofless` (`attachLabelProof` guard) excludes AI rows; `getProductForCorrection` returns null for one, so `/products/<id>/correct` 404s rather than promoting a guess to a shared, label-proved row.
  - **Any new search, match, barcode or photo-proof writer applies the same guard.**
- Reuse through recipes only. `(AI estimate)` tag on recipe and `AI estimate` on item derived from origin, never stored; swapping every guess for a real product clears recipe tag.
- Figures bounded in `features/lazy-track/actions/lazy-track.utils.ts` (each constant labelled physical or judgment), run on Gemini reply and again in `logLazyMeal`: figures round-trip through browser.
- Review edits: grams, remove, re-ask. No name or per-100g edits, no correction link, no portion overrides on AI rows.
- Consent reuses `AiConsentSheet` / `levelspoon:ai-photo-consent`, asked before text-only requests too. Meal photo sent, never stored.
- No usage cap, on purpose: AI is BYOK only, user's own key carries cost (`docs/DECISIONS.md`).
- Refusals cross as `EstimateMealResult` / `LogLazyMealResult`.
- `MEAL_ESTIMATE_PROVIDER` picks mock vs Gemini; `.env.example` defaults `mock`.
- Spec: `docs/superpowers/specs/2026-09-25-lazy-track-design.md`.
