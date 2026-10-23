import { describe, expect, it } from "vitest";

import type { MealDetail, MealIngredientDetail } from "@/features/meals/actions/meals";
import { ZERO_NUTRITION } from "@/lib/nutrition/totals";

import { mealShareText } from "./share-meal.utils";

const ingredient = (overrides: Partial<MealIngredientDetail>): MealIngredientDetail => ({
  id: "ingredient",
  productId: "product",
  productName: "Oats",
  quantity: 80,
  quantityUnit: "g",
  entryCount: null,
  entryUnit: null,
  quantitySource: "manual",
  contribution: ZERO_NUTRITION,
  densityGMl: null,
  servingUnit: null,
  servingGrams: null,
  nutritionBasisUnit: "g",
  portions: [],
  isAiEstimate: false,
  ...overrides,
});

const meal = (overrides: Partial<MealDetail>): MealDetail => ({
  id: "meal",
  mealNumber: 2,
  date: "2026-10-23",
  ingredients: [],
  total: ZERO_NUTRITION,
  dayCalorieRemaining: { status: "left", kcal: 900 },
  recipe: null,
  ...overrides,
});

describe("mealShareText", () => {
  it("lists each ingredient as the meal page reads it, then the total", () => {
    const text = mealShareText(
      meal({
        ingredients: [
          ingredient({ contribution: { ...ZERO_NUTRITION, energyKcal: 303.4 } }),
          ingredient({ productName: "Bread", quantity: 60, entryCount: 2, entryUnit: "slice", contribution: { ...ZERO_NUTRITION, energyKcal: 148 } }),
          ingredient({ productName: "Chicken curry", quantity: 250, isAiEstimate: true, contribution: { ...ZERO_NUTRITION, energyKcal: 1410 } }),
        ],
        total: { ...ZERO_NUTRITION, energyKcal: 1861.4, proteinG: 52.4, carbohydrateG: 97.6, fatG: 34 },
      }),
    );

    expect(text).toBe(
      [
        "Meal 2 · Fri 23 Oct",
        "Oats — 80 g · 303 kcal",
        "Bread — 2 slice · 60 g · 148 kcal",
        "Chicken curry (AI estimate) — 250 g · 1,410 kcal",
        "",
        "Total 1,861 kcal · P 52g · C 98g · F 34g",
      ].join("\n"),
    );
  });

  it("titles a meal made from a recipe by the recipe's name", () => {
    const recipe = { id: "recipe", name: "Overnight oats", matches: true, recipeIsSubset: true, isAiEstimate: false };
    expect(mealShareText(meal({ recipe })).split("\n")[0]).toBe("Overnight oats · Fri 23 Oct");
  });

  it("leaves out the day's goal and what remains of it", () => {
    expect(mealShareText(meal({ dayCalorieRemaining: { status: "over", kcal: 412 } }))).not.toContain("412");
  });
});
