import anyAscii from "any-ascii";

import type { AmountRow } from "./recipes.store";

/** An amount as either side of the comparison states it: the product, and how
 * much of it, already read out of `numeric` into a JS number. */
interface RecipeAmount {
  productId: string;
  quantity: number;
}

// quantity is numeric(10,2), so two figures that differ by less than half a
// stored unit are the same stored figure. Comparing with === would make a
// float artifact (180.00000000000003 out of a unit conversion) read as a
// hand edit and paint the red line on a meal nobody touched.
const AMOUNT_EPSILON = 0.005;

const amountKey = (amount: RecipeAmount): string =>
  `${amount.productId}:${amount.quantity.toFixed(2)}`;

// Multiset, not set: a meal can hold two rows of the same product, and
// collapsing them would call a doubled meal identical to its recipe.
const toMultiset = (amounts: readonly RecipeAmount[]): Map<string, number> =>
  amounts.reduce((counts, amount) => {
    const key = amountKey(amount);
    return counts.set(key, (counts.get(key) ?? 0) + 1);
  }, new Map<string, number>());

// Shared by mealMatchesRecipe and recipeIsSubsetOfMeal - both compare against
// the column's own scale, never raw floats.
const roundedToScale = (amounts: readonly RecipeAmount[]): RecipeAmount[] =>
  amounts.map((amount) => ({
    productId: amount.productId,
    quantity: Math.round(amount.quantity / AMOUNT_EPSILON) * AMOUNT_EPSILON,
  }));

/**
 * Whether a linked meal still equals the recipe it came from.
 *
 * The one place this question is answered. It decides which earlier meals may
 * be retro-updated and whether a meal page carries its divergence line - the
 * same fact, asked twice. Nothing stores it: a boolean would have to be
 * cleared and set by every ingredient write path, and a comparison cannot
 * drift from the rows it compares.
 *
 * Both sides must already be numbers. `numeric` reads back as a string, and
 * "180.00" === "180" is false.
 */
export const mealMatchesRecipe = (
  mealRows: readonly RecipeAmount[],
  recipeItems: readonly RecipeAmount[],
): boolean => {
  if (mealRows.length !== recipeItems.length) {
    return false;
  }
  const left = toMultiset(roundedToScale(mealRows));
  const right = toMultiset(roundedToScale(recipeItems));
  return [...left].every(([key, count]) => right.get(key) === count);
};

/**
 * Whether every item the recipe lists is present in the meal at least as many
 * times - the meal may hold extra rows the recipe never had.
 *
 * The "picked a recipe into a meal that already held something else" case:
 * the whole recipe survives, plus extra, which is what the user asked for and
 * not drift. Used to suppress the divergence line for exactly that shape,
 * while a genuine change - an amount edited, a row removed - still fails this
 * the same way it fails mealMatchesRecipe. Multiset-aware for the same reason
 * that comparison is: a recipe (or a meal) can list one product twice.
 */
export const recipeIsSubsetOfMeal = (
  mealRows: readonly RecipeAmount[],
  recipeItems: readonly RecipeAmount[],
): boolean => {
  const mealCounts = toMultiset(roundedToScale(mealRows));
  const recipeCounts = toMultiset(roundedToScale(recipeItems));
  return [...recipeCounts].every(([key, count]) => (mealCounts.get(key) ?? 0) >= count);
};

/** kcal for one unit of a saved row's own `quantityUnit`, from the figures
 * the meal page already holds - so the edit sheet prices a retyped amount
 * with no round trip. Zero for a zero amount: no row can be priced from one,
 * and Infinity would poison the total. */
export const kcalPerUnit = (contributionKcal: number, quantity: number): number =>
  quantity > 0 ? contributionKcal / quantity : 0;

/** One row of the edit sheet's first pane - the open meal's own rows, which
 * is what an overwrite files.
 *
 * `quantity` is the raw typed text, not a parsed number - same reason
 * ingredient-row.tsx's own amount editor holds a string: a controlled input
 * fed back through `Number()` on every keystroke can never hold "2." long
 * enough for the next digit, so a decimal amount would be untypable.
 * `draftKcal`/`draftIsSaveable` parse it themselves; `Number("")` and
 * `Number("abc")` both fail their `> 0` checks the same way `Number("0")`
 * does, so a blank or invalid field reads as "not yet a valid amount", never
 * a thrown error.
 *
 * `initialQuantity` is `quantity` as seeded, before any typing -
 * `draftRowToAmountRow` compares the two to tell an untouched row from an
 * edited one, since `entryUnit === quantityUnit` cannot: a chip-sourced row
 * ("2 slices") stores entryUnit "slice" against quantityUnit "g" even when
 * nobody touched it. */
export interface DraftRow {
  mealIngredientId: string;
  productId: string;
  productName: string;
  quantity: string;
  initialQuantity: string;
  quantityUnit: string;
  entryCount: number | null;
  entryUnit: string | null;
  quantitySource: "ai_estimated" | "manual";
  kcalPerUnit: number;
}

export const draftKcal = (rows: readonly DraftRow[]): number =>
  rows.reduce((total, row) => total + Number(row.quantity) * row.kcalPerUnit, 0);

/**
 * A draft row as the amount it actually saves.
 *
 * The entry echo and quantity_source follow the row only when its amount is
 * exactly what it was seeded with. Retyping the amount is what invalidates
 * "2 slices" - and is what docs/AMOUNTS.md's manual-entry rule means by "any edit":
 * an edited row's source becomes "manual", the same as a typed amount
 * anywhere else in the app. A row nobody touched keeps whatever it already
 * was, ai_estimated included - editing sibling rows in the same draft must
 * not relabel this one.
 */
export const draftRowToAmountRow = (row: DraftRow): AmountRow => {
  const isUntouched = row.quantity === row.initialQuantity;
  return {
    productId: row.productId,
    quantity: Number(row.quantity),
    quantityUnit: row.quantityUnit,
    entryCount: isUntouched ? row.entryCount : null,
    entryUnit: isUntouched ? row.entryUnit : null,
    quantitySource: isUntouched ? row.quantitySource : "manual",
  };
};

/** A recipe with no ingredients is one the picker cannot price and nobody can
 * use, so Save stays off until every remaining row carries an amount. */
export const draftIsSaveable = (rows: readonly DraftRow[]): boolean =>
  rows.length > 0 && rows.every((row) => Number(row.quantity) > 0);

/** Judgment: fits one line of the picker beside its kcal column on a phone,
 * and still holds a long real name ("Chicken rice bowl with avocado and lime"
 * is 39). Counted in UTF-16 units, the same unit an input's maxLength counts. */
export const RECIPE_NAME_MAX_LENGTH = 60;
// Judgment: ten characters' warning is enough to finish a word.
const RECIPE_NAME_COUNTER_HEADROOM = 10;
const RECIPE_NAME_COUNTER_FROM = RECIPE_NAME_MAX_LENGTH - RECIPE_NAME_COUNTER_HEADROOM;

export const isValidRecipeName = (name: string): boolean => {
  const length = name.trim().length;
  return length > 0 && length <= RECIPE_NAME_MAX_LENGTH;
};

// Said when Save is tapped: Save stays enabled, so a refusal needs words.
export const recipeNameError = (name: string): string =>
  name.trim().length === 0 ? "Give the recipe a name." : `Shorten the name to ${RECIPE_NAME_MAX_LENGTH} characters.`;

/** Silent until the limit is near, so the field only speaks when the count
 * matters. A name saved before the limit existed can start over it; the hint
 * then says why Save stays off. */
export const recipeNameHint = (name: string): string | undefined => {
  const length = name.trim().length;
  if (length < RECIPE_NAME_COUNTER_FROM) return undefined;
  const count = `${length} of ${RECIPE_NAME_MAX_LENGTH} characters`;
  return length > RECIPE_NAME_MAX_LENGTH ? `${count}. Shorten it to save.` : count;
};

/** An earlier meal today from the same recipe, as the save pane needs it. */
export interface EarlierMeal {
  mealId: string;
  mealNumber: number;
  /** What that meal totals right now, so the prompt states a measured delta
   * rather than a guessed one. */
  currentKcal: number;
  matches: boolean;
}

export const offerableMeals = (meals: readonly EarlierMeal[]): EarlierMeal[] =>
  meals.filter((meal) => meal.matches);

export const divergedMeals = (meals: readonly EarlierMeal[]): EarlierMeal[] =>
  meals.filter((meal) => !meal.matches);

const mealNames = (meals: readonly EarlierMeal[]): string[] =>
  meals.map((meal) => `Meal ${meal.mealNumber}`);

// U+2212 MINUS SIGN, not a hyphen: the hyphen renders as a dash too short to
// read as a sign beside a tabular figure.
const MINUS_SIGN = "−";

const signedKcal = (delta: number): string => {
  const rounded = Math.round(delta);
  return rounded < 0 ? `${MINUS_SIGN}${Math.abs(rounded)} kcal` : `+${rounded} kcal`;
};

const joinWithAnd = (names: readonly string[]): string =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/**
 * The tick's label, or null when nothing may be offered.
 *
 * Only meals that still match are ever passed in. The wholesale rewrite is
 * safe precisely there: a meal identical to the old recipe has nothing of the
 * user's own in it to destroy.
 */
export const earlierMealsTickLabel = (
  offerable: readonly EarlierMeal[],
  draftTotalKcal: number,
): string | null => {
  if (offerable.length === 0) {
    return null;
  }
  const delta = offerable.reduce((sum, meal) => sum + (draftTotalKcal - meal.currentKcal), 0);
  return `Also update ${joinWithAnd(mealNames(offerable))} from earlier today (${signedKcal(delta)})`;
};

/** Names the meals the update leaves alone. They are never silently excluded
 * and never silently overwritten. */
export const divergedSentence = (diverged: readonly EarlierMeal[]): string | null => {
  if (diverged.length === 0) {
    return null;
  }
  const names = joinWithAnd(mealNames(diverged));
  return diverged.length === 1
    ? `${names} was changed after you logged it, so it is left as it is.`
    : `${names} were changed after you logged them, so they are left as they are.`;
};

/** The red line a diverged meal carries on its own page. Neutral about which
 * side moved: the user edited this meal, added an ingredient to it, or
 * overwrote the recipe from a later meal, and nothing here can tell those
 * apart. "The recipe has changed" would be false in the first two. */
export const divergenceLine = (recipeName: string): string =>
  `This meal no longer matches "${recipeName}". To update the recipe from this meal, use Edit this recipe; to keep both, save this as a new recipe.`;

// Folded the way lib/db/search-text.ts folds a product name, so "Сирење"
// is found from a Latin keyboard here too. Not imported from there: lib/db is
// server-only territory, and this runs in the picker as the user types.
const foldForSearch = (text: string): string => anyAscii(text).toLowerCase();

// Every typed word must appear somewhere in the name, in any order: "rice
// chicken" finds "Chicken rice bowl". A blank query matches everything.
export const recipeMatchesQuery = (name: string, query: string): boolean => {
  const folded = foldForSearch(name);
  return foldForSearch(query)
    .split(/\s+/)
    .filter((word) => word !== "")
    .every((word) => folded.includes(word));
};
