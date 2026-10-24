# Meals

Rules for history page, recipes, sharing a meal and lazy track. Day model (`meals.log_date`, local day) is in `docs/ARCHITECTURE.md` "Time model".

## History

One row per day user logged, newest first, paged at `HISTORY_PAGE_SIZE`. `history.utils.ts` shapes rows; query stays one row per logged day.

- **Load more depth lives in the URL** (`?pages=N`, written with native `history.replaceState` so the rows on screen are not re-fetched). The page reads all N pages in its first read (`getDayHistory(0, pageCount)`, capped at `MAX_HISTORY_PAGES`), so Back returns to the same rows.

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

## Share meal

`Share meal` on meal page (`share-meal-button.tsx`), hidden when meal has no ingredients. Sends plain text built by `mealShareText` (`share-meal.utils.ts`): title (recipe name, else `Meal N`) and calendar date, one line per ingredient in ingredient-row wording (`quantityText`, kcal, `(AI estimate)` tag), then total kcal and P/C/F.

- Text only, no JSON, no import. Readable by someone without app.
- Carries food only: no sender, no ids, no goal or day remaining (would tell reader sharer's target).
- Date is calendar date (`formatCalendarDate`), never `Today`: wrong by time someone reads it.
- `navigator.share` where browser has it; user closing menu (`AbortError`) does nothing. No share menu, or any other refusal, falls back to clipboard: button reads `Copied`, live region says `Meal copied.`
- Client only: no Server Action, no request.

## Copy and paste

Copy ingredient rows out of one meal, paste them with their amounts into another. Spec: `docs/superpowers/specs/2026-10-24-copy-paste-ingredients-design.md`.

- Copied list per device: `localStorage` key `levelspoon:copied:<userId>` (`copied-ingredients.ts`, `useSyncExternalStore` + `storage` event). No session user yet means no key, empty list, writes do nothing. Unreadable or malformed value reads as empty; bad entries dropped (`parseCopied`).
- Entries snapshot at copy time (`CopiedIngredient`, `copied-ingredients.utils.ts`): editing or removing source row later leaves entry as copied. `energyKcal` display only; pasted row reads live nutrition.
- Row `Copy` / `Copied` toggle between `Edit` and `Remove`, hidden while row edited. `Copy meal` beside `Share meal` adds rows not yet copied; on a fully copied meal it takes that meal's rows off. Both local only, no request.
- Paste area (`paste-area.tsx`) shown only when list non-empty: top of capture options (above `Add a product to a meal`) and under `Add ingredient` on meal page. `Paste` / `Paste all N` is its only request. `×` drops one entry; `Clear` collapses to `Copied list cleared` + `Undo`, all local. Capture paste navigates to meal page; meal page paste stays, list kept.
- `pasteIngredients` (`features/meals/actions/meals.ts`): shape check first (`isValidPasteItems`, `MAX_PASTE_ITEMS`), then owned meal and product availability together (`fetchUnavailableProductIds`), then one transaction through `appendItemsToMeal`. All or nothing.
  - Product passes when standard (`p.source = 'standard'`) or `visibleToUser`. Standard clause needed: curated rows have no photo or barcode and belong to system user.
  - No `notAiEstimate`: user's own AI rows pasteable; nobody else's passes visibility.
  - Pasting a product already in meal adds second row, never merges. Recipe link untouched.
- Refusals cross as `PasteIngredientsResult` (`pasted` / `meal_missing` / `unavailable` / `invalid`). On `unavailable` client drops every entry of those products and says what is left to paste.

## Lazy track (Gemini job 2)

Least accurate logging path, on purpose: user describes meal (+ optional photo), Gemini returns itemized estimate (`estimateMeal`, `features/lazy-track/actions/lazy-track.ts`: meal name, items, grams, eight per-100g figures), user fixes grams, logs. Reached from wizard `Add a meal` section.

- **Guesses are private `products` rows**, `nutrition_origin = 'ai_estimate'`.
  - `products_ai_estimate_private` CHECK forbids label photo and `standard` source.
  - `assertNotAiEstimate` guards `linkBarcode` and `setPortionGrams`.
  - `notAiEstimate` fragment keeps them out of `searchUserProducts`, `matchProduct`, `findSameFigures`, `assertUserProduct`, `findStoredMeasures`.
  - `isProofless` (`attachLabelProof` guard) excludes AI rows; `getProductForCorrection` returns null for one, so `/products/<id>/correct` 404s rather than promoting a guess to a shared, label-proved row.
  - **Any new search, match, barcode or photo-proof writer applies the same guard.**
- Reuse through recipes and copy/paste only. `(AI estimate)` tag on recipe and `AI estimate` on item derived from origin, never stored; swapping every guess for a real product clears recipe tag.
- Prompt pins grams and per-100 g to same state (cooked rice never scored as dry), takes stated amounts as given, salt in g never sodium mg.
- `reasoning_effort: "high"`, most `gemini-3.5-flash-lite` offers: user's own key carries cost. Splits mixed dishes into components; ~9-10 s against ~5 s at default. Thinking counts toward `MAX_RESPONSE_TOKENS`.
- Figures bounded in `features/lazy-track/actions/lazy-track.utils.ts` (each constant labelled physical or judgment), run on Gemini reply and again in `logLazyMeal`: figures round-trip through browser.
  - kcal between 0.75x and 1.2x Atwater energy of macros (+25 kcal untracked, e.g. vinegar): catches per-100 g kcal beside per-serving macros, either way.
  - `alcoholG` (7 kcal/g) read by bounds only, never stored (`docs/DECISIONS.md`): without it every drink fails ceiling.
  - Rounding slack on every limit (USDA lard is 902 kcal).
  - Dropped item counted (`droppedCount`); review says how many left out. All dropped → `implausible_figures`, never `nothing_found`.
- Review edits: grams, remove, re-ask. No name or per-100g edits, no correction link, no portion overrides on AI rows.
- Consent reuses `AiConsentSheet` / `levelspoon:ai-photo-consent`, asked before text-only requests too. Meal photo sent, never stored.
- No usage cap, on purpose: AI is BYOK only, user's own key carries cost (`docs/DECISIONS.md`).
- Refusals cross as `EstimateMealResult` / `LogLazyMealResult`. Provider failures map through `geminiFailureKind` (`lib/gemini/client.ts`): missing key, refused key, quota, timeout, unreadable photo each own kind. Copy says "try again" only where a retry can work.
- `MEAL_ESTIMATE_PROVIDER` picks mock vs Gemini; `.env.example` defaults `mock`.
- Spec: `docs/superpowers/specs/2026-09-25-lazy-track-design.md`.
