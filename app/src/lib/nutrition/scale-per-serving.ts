import type { NutritionValues } from "@/actions/products";

const PER_100G_GRAMS = 100;

export const scalePerServingToPer100g = (
  perServing: NutritionValues,
  grams: number,
): NutritionValues => {
  const scale = PER_100G_GRAMS / grams;
  return {
    energyKcal: perServing.energyKcal * scale,
    fatG: perServing.fatG * scale,
    saturatesG: perServing.saturatesG * scale,
    carbohydrateG: perServing.carbohydrateG * scale,
    sugarsG: perServing.sugarsG * scale,
    proteinG: perServing.proteinG * scale,
    saltG: perServing.saltG * scale,
  };
};
