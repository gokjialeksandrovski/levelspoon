/** An amount as either side of the comparison states it: the product, and how
 * much of it, already read out of `numeric` into a JS number. */
export interface RecipeAmount {
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
  const rounded = (amounts: readonly RecipeAmount[]) =>
    amounts.map((amount) => ({
      productId: amount.productId,
      quantity: Math.round(amount.quantity / AMOUNT_EPSILON) * AMOUNT_EPSILON,
    }));
  const left = toMultiset(rounded(mealRows));
  const right = toMultiset(rounded(recipeItems));
  return [...left].every(([key, count]) => right.get(key) === count);
};

/** kcal for one unit of a saved row's own `quantityUnit`, from the figures
 * the meal page already holds - so the edit sheet prices a retyped amount
 * with no round trip. Zero for a zero amount: no row can be priced from one,
 * and Infinity would poison the total. */
export const kcalPerUnit = (contributionKcal: number, quantity: number): number =>
  quantity > 0 ? contributionKcal / quantity : 0;

/** One row of the edit sheet's first pane - the open meal's own rows, which
 * is what an overwrite files. */
export interface DraftRow {
  mealIngredientId: string;
  productId: string;
  productName: string;
  quantity: number;
  quantityUnit: string;
  entryCount: number | null;
  entryUnit: string | null;
  kcalPerUnit: number;
}

export const draftKcal = (rows: readonly DraftRow[]): number =>
  rows.reduce((total, row) => total + row.quantity * row.kcalPerUnit, 0);

/** A recipe with no ingredients is one the picker cannot price and nobody can
 * use, so Save stays off until every remaining row carries an amount. */
export const draftIsSaveable = (rows: readonly DraftRow[]): boolean =>
  rows.length > 0 && rows.every((row) => row.quantity > 0);

export const isValidRecipeName = (name: string): boolean => name.trim().length > 0;

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
  const noun = offerable.length === 1 ? "the meal you ate" : "the meals you ate";
  const delta = offerable.reduce((sum, meal) => sum + (draftTotalKcal - meal.currentKcal), 0);
  return `Also update ${noun} from it earlier today (${mealNames(offerable).join(", ")}) — ${signedKcal(delta)}`;
};

const joinWithAnd = (names: readonly string[]): string =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

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
