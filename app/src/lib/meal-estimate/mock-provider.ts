import type { MealEstimateProvider } from "./provider";

// Fixed, plausible bowl so dev, CI and e2e run with zero AI spend. The oil
// row sits at the physical limits on purpose, so the bounds see it every run.
const MOCK_ESTIMATE = {
  mealName: "Chicken rice bowl",
  items: [
    { name: "Chicken breast", grams: 150, per100g: { energyKcal: 165, fatG: 3.6, saturatesG: 1, carbohydrateG: 0, sugarsG: 0, proteinG: 31, saltG: 0.2, fibreG: 0 } },
    { name: "White rice, cooked", grams: 200, per100g: { energyKcal: 130, fatG: 0.3, saturatesG: 0.1, carbohydrateG: 28, sugarsG: 0.1, proteinG: 2.7, saltG: 0, fibreG: 0.4 } },
    { name: "Olive oil", grams: 10, per100g: { energyKcal: 884, fatG: 100, saturatesG: 14, carbohydrateG: 0, sugarsG: 0, proteinG: 0, saltG: 0, fibreG: null } },
  ],
};

export class MockMealEstimateProvider implements MealEstimateProvider {
  async estimate(_description: string, _photo: Buffer | null): Promise<unknown> {
    return MOCK_ESTIMATE;
  }
}
