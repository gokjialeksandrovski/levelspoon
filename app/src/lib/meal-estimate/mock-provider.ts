import type { MealEstimateProvider } from "./provider";

// Same marker idea as lib/ocr/mock-provider.ts's fixture markers: a plain
// string an e2e test can embed in its description to force the failure path
// deterministically, without a real Gemini outage.
export const MOCK_UNAVAILABLE_MARKER = "[mock:unavailable]";

// Fixed, plausible bowl so dev, CI and e2e run with zero AI spend. The oil
// row sits at the physical limits on purpose, so the bounds see it every run.
const MOCK_ESTIMATE = {
  mealName: "Chicken rice bowl",
  items: [
    { name: "Chicken breast", grams: 150, per100g: { energyKcal: 165, fatG: 3.6, saturatesG: 1, carbohydrateG: 0, sugarsG: 0, proteinG: 31, saltG: 0.2, fibreG: 0, alcoholG: 0 } },
    { name: "White rice, cooked", grams: 200, per100g: { energyKcal: 130, fatG: 0.3, saturatesG: 0.1, carbohydrateG: 28, sugarsG: 0.1, proteinG: 2.7, saltG: 0, fibreG: 0.4, alcoholG: 0 } },
    { name: "Olive oil", grams: 10, per100g: { energyKcal: 884, fatG: 100, saturatesG: 14, carbohydrateG: 0, sugarsG: 0, proteinG: 0, saltG: 0, fibreG: null, alcoholG: 0 } },
  ],
};

export class MockMealEstimateProvider implements MealEstimateProvider {
  async estimate(description: string, _photo: Buffer | null): Promise<unknown> {
    if (description.includes(MOCK_UNAVAILABLE_MARKER)) throw new Error("mock estimate unavailable");
    return MOCK_ESTIMATE;
  }
}
