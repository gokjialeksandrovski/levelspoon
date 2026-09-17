// No jsdom in this repo's tests - locks in the two pure functions MealList's
// JSX calls to decide what to show.
import { describe, expect, it } from "vitest";

import type { DayMealSummary } from "@/features/meals/actions/meals";

import { mealHeading, summariseIngredients } from "./meal-list";

describe("summariseIngredients", () => {
  it("joins names when there are two or fewer", () => {
    expect(summariseIngredients(["Yogurt"])).toBe("Yogurt");
    expect(summariseIngredients(["Yogurt", "Granola"])).toBe("Yogurt, Granola");
  });

  it("shows the first two plus a count of the rest beyond that", () => {
    expect(summariseIngredients(["Yogurt", "Granola", "Honey"])).toBe("Yogurt, Granola, +1");
    expect(summariseIngredients(["Yogurt", "Granola", "Honey", "Berries"])).toBe("Yogurt, Granola, +2");
  });
});

const meal = (ingredientNames: string[]): DayMealSummary => ({
  id: "meal-1",
  total: { energyKcal: 0, fatG: 0, saturatesG: 0, carbohydrateG: 0, sugarsG: 0, proteinG: 0, saltG: 0 },
  ingredientNames,
});

describe("mealHeading", () => {
  it("uses the ingredient's own name as the heading, with no subtitle, when there's exactly one", () => {
    expect(mealHeading(meal(["Olympus Greek Yogurt 2% Fat"]), 0)).toEqual({
      heading: "Olympus Greek Yogurt 2% Fat",
      subtitle: null,
    });
  });

  it("falls back to a 1-based \"Meal N\" with a summarised subtitle once there's more than one ingredient", () => {
    expect(mealHeading(meal(["Chicken", "Rice"]), 1)).toEqual({
      heading: "Meal 2",
      subtitle: "Chicken, Rice",
    });
  });
});
