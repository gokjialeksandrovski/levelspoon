import { describe, expect, it } from "vitest";

import {
  divergedSentence,
  divergenceLine,
  draftIsSaveable,
  draftKcal,
  draftRowToAmountRow,
  divergedMeals,
  earlierMealsTickLabel,
  isValidRecipeName,
  kcalPerUnit,
  mealMatchesRecipe,
  offerableMeals,
  recipeIsSubsetOfMeal,
  type DraftRow,
  type EarlierMeal,
} from "./recipes.utils";

const amount = (productId: string, quantity: number) => ({ productId, quantity });

describe("mealMatchesRecipe", () => {
  const recipe = [amount("chicken", 180), amount("rice", 200)];

  it("matches an identical set whatever the row order", () => {
    expect(mealMatchesRecipe([amount("rice", 200), amount("chicken", 180)], recipe)).toBe(true);
  });

  it("does not match a changed amount", () => {
    expect(mealMatchesRecipe([amount("chicken", 180), amount("rice", 250)], recipe)).toBe(false);
  });

  it("does not match a removed row", () => {
    expect(mealMatchesRecipe([amount("chicken", 180)], recipe)).toBe(false);
  });

  it("does not match an added row", () => {
    expect(mealMatchesRecipe([...recipe, amount("oil", 10)], recipe)).toBe(false);
  });

  // [RF-1] A meal can hold two rows of the same product - the user logged
  // olive oil twice, or entered this very recipe into the meal a second time.
  // Comparing sets instead of multisets would call the doubled meal
  // "matching" and let a wholesale retro-update silently halve it. The
  // second expect is the one that actually pins multiset vs. set: lengths
  // are equal (2 vs 2) here, so the length guard cannot mask a set-based
  // comparison, which would see only the distinct key "chicken:180.00",
  // find it present in the recipe, and wrongly call this a match.
  it("does not match a meal holding the same product twice", () => {
    expect(mealMatchesRecipe([amount("chicken", 180), amount("chicken", 180), amount("rice", 200)], recipe)).toBe(false);
    expect(mealMatchesRecipe([amount("chicken", 180), amount("chicken", 180)], recipe)).toBe(false);
  });

  it("matches a recipe that itself lists one product twice", () => {
    const twice = [amount("oil", 10), amount("oil", 5)];
    expect(mealMatchesRecipe([amount("oil", 5), amount("oil", 10)], twice)).toBe(true);
    expect(mealMatchesRecipe([amount("oil", 10), amount("oil", 10)], twice)).toBe(false);
  });

  it("treats two empty sides as matching", () => {
    expect(mealMatchesRecipe([], [])).toBe(true);
  });

  // [RF-2a] Postgres hands `quantity` back as "180.00". Every caller is
  // expected to Number() before calling this, and a fractional gram is a real
  // amount, so the comparison is on numbers with a tolerance below the
  // column's own scale rather than on strings.
  it("treats amounts equal to the stored scale as equal", () => {
    expect(mealMatchesRecipe([amount("chicken", 180.001)], [amount("chicken", 180)])).toBe(true);
    expect(mealMatchesRecipe([amount("chicken", 180.02)], [amount("chicken", 180)])).toBe(false);
  });
});

describe("recipeIsSubsetOfMeal", () => {
  const recipe = [amount("chicken", 180), amount("rice", 200)];

  it("is true when the meal holds the recipe plus an extra row", () => {
    expect(recipeIsSubsetOfMeal([...recipe, amount("coffee", 5)], recipe)).toBe(true);
  });

  it("is true for an exact match, the trivial subset", () => {
    expect(recipeIsSubsetOfMeal(recipe, recipe)).toBe(true);
  });

  it("is false when an amount was changed, not just added to", () => {
    expect(recipeIsSubsetOfMeal([amount("chicken", 250), amount("rice", 200)], recipe)).toBe(false);
  });

  it("is false when a recipe row is missing from the meal", () => {
    expect(recipeIsSubsetOfMeal([amount("chicken", 180)], recipe)).toBe(false);
  });

  // The recipe needs two copies present, not one - a set comparison would
  // wrongly call one "enough".
  it("requires the meal to hold as many copies as the recipe lists", () => {
    const twice = [amount("oil", 10), amount("oil", 10)];
    expect(recipeIsSubsetOfMeal([amount("oil", 10)], twice)).toBe(false);
    expect(recipeIsSubsetOfMeal([amount("oil", 10), amount("oil", 10), amount("coffee", 5)], twice)).toBe(true);
  });
});

describe("kcalPerUnit", () => {
  it("divides a saved contribution by the amount that produced it", () => {
    expect(kcalPerUnit(140, 200)).toBe(0.7);
  });

  it("is zero for a zero amount rather than Infinity", () => {
    expect(kcalPerUnit(140, 0)).toBe(0);
  });
});

const draftRow = (overrides: Partial<DraftRow> = {}): DraftRow => ({
  mealIngredientId: crypto.randomUUID(),
  productId: "chicken",
  productName: "Chicken breast",
  quantity: "180",
  initialQuantity: "180",
  quantityUnit: "g",
  entryCount: 180,
  entryUnit: "g",
  quantitySource: "manual",
  kcalPerUnit: 1,
  ...overrides,
});

describe("draftKcal", () => {
  it("prices every row at its own per-unit figure", () => {
    expect(draftKcal([draftRow({ quantity: "180", kcalPerUnit: 1 }), draftRow({ quantity: "200", kcalPerUnit: 0.7 })])).toBe(320);
  });
});

describe("draftIsSaveable", () => {
  it("refuses an empty draft", () => {
    expect(draftIsSaveable([])).toBe(false);
  });

  it("refuses a row with a non-positive amount", () => {
    expect(draftIsSaveable([draftRow({ quantity: "0" })])).toBe(false);
  });

  // A field mid-typing ("2.") or just cleared ("") is not yet a valid
  // amount, not a thrown error - the input holds raw text (see DraftRow).
  it("refuses a row with a blank or non-numeric amount", () => {
    expect(draftIsSaveable([draftRow({ quantity: "" })])).toBe(false);
    expect(draftIsSaveable([draftRow({ quantity: "abc" })])).toBe(false);
  });

  it("accepts a draft whose rows all carry an amount", () => {
    expect(draftIsSaveable([draftRow()])).toBe(true);
  });
});

describe("draftRowToAmountRow", () => {
  // The real shape a chip-sourced row carries: entryUnit ("slice") never
  // equals quantityUnit ("g"), even when the row is untouched - so the old
  // entryUnit === quantityUnit check nulled the echo on every row like this.
  it("keeps the entry echo and source on a row the user never touched", () => {
    const row = draftRow({
      quantity: "60",
      initialQuantity: "60",
      quantityUnit: "g",
      entryCount: 2,
      entryUnit: "slice",
      quantitySource: "ai_estimated",
    });
    expect(draftRowToAmountRow(row)).toEqual({
      productId: "chicken",
      quantity: 60,
      quantityUnit: "g",
      entryCount: 2,
      entryUnit: "slice",
      quantitySource: "ai_estimated",
    });
  });

  it("drops the echo and relabels the source manual on a row the user retyped", () => {
    const row = draftRow({
      quantity: "90",
      initialQuantity: "60",
      quantityUnit: "g",
      entryCount: 2,
      entryUnit: "slice",
      quantitySource: "ai_estimated",
    });
    expect(draftRowToAmountRow(row)).toEqual({
      productId: "chicken",
      quantity: 90,
      quantityUnit: "g",
      entryCount: null,
      entryUnit: null,
      quantitySource: "manual",
    });
  });
});

describe("isValidRecipeName", () => {
  it("refuses empty and whitespace-only names", () => {
    expect(isValidRecipeName("")).toBe(false);
    expect(isValidRecipeName("   ")).toBe(false);
  });

  it("accepts a name in any script", () => {
    expect(isValidRecipeName("Сирење и леб")).toBe(true);
  });
});

const earlier = (mealNumber: number, matches: boolean, currentKcal = 400): EarlierMeal => ({
  mealId: `meal-${mealNumber}`,
  mealNumber,
  currentKcal,
  matches,
});

describe("earlier-meals copy", () => {
  it("splits offerable from diverged", () => {
    const list = [earlier(1, false), earlier(3, true)];
    expect(offerableMeals(list).map((meal) => meal.mealNumber)).toEqual([3]);
    expect(divergedMeals(list).map((meal) => meal.mealNumber)).toEqual([1]);
  });

  it("states a signed kcal delta against the draft", () => {
    expect(earlierMealsTickLabel([earlier(3, true, 400)], 445)).toBe(
      "Also update the meal you ate from it earlier today (Meal 3): +45 kcal",
    );
  });

  it("states a negative delta with its own sign", () => {
    expect(earlierMealsTickLabel([earlier(3, true, 500)], 445)).toBe(
      "Also update the meal you ate from it earlier today (Meal 3): −55 kcal",
    );
  });

  it("pluralises the tick over several meals and sums their movement", () => {
    expect(earlierMealsTickLabel([earlier(1, true, 400), earlier(3, true, 400)], 445)).toBe(
      "Also update the meals you ate from it earlier today (Meal 1, Meal 3): +90 kcal",
    );
  });

  it("renders no tick when nothing is offerable", () => {
    expect(earlierMealsTickLabel([], 445)).toBeNull();
  });

  it("names a diverged meal without offering it", () => {
    expect(divergedSentence([earlier(1, false)])).toBe(
      "Meal 1 was changed after you logged it, so it is left as it is.",
    );
  });

  it("pluralises the diverged sentence", () => {
    expect(divergedSentence([earlier(1, false), earlier(4, false)])).toBe(
      "Meal 1 and Meal 4 were changed after you logged them, so they are left as they are.",
    );
  });

  it("renders no sentence when nothing diverged", () => {
    expect(divergedSentence([])).toBeNull();
  });
});

describe("divergenceLine", () => {
  // Neutral about which side moved: the user edited this meal, added to it,
  // or overwrote the recipe from a later meal, and the line cannot tell them
  // apart. "The recipe has changed" would be false in the first two.
  it("names the recipe and both ways out", () => {
    expect(divergenceLine("Chicken rice bowl")).toBe(
      'This meal no longer matches "Chicken rice bowl". To update the recipe from this meal, use Edit this recipe; to keep both, save this as a new recipe.',
    );
  });
});
