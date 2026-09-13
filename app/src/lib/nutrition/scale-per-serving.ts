import type { NutritionValues } from "@/actions/products";

const PER_100G_GRAMS = 100;

export const scaleNutrition = (values: NutritionValues, factor: number): NutritionValues => ({
  energyKcal: values.energyKcal * factor,
  fatG: values.fatG * factor,
  saturatesG: values.saturatesG * factor,
  carbohydrateG: values.carbohydrateG * factor,
  sugarsG: values.sugarsG * factor,
  proteinG: values.proteinG * factor,
  saltG: values.saltG * factor,
});

export const scalePerServingToPer100g = (perServing: NutritionValues, grams: number): NutritionValues =>
  scaleNutrition(perServing, PER_100G_GRAMS / grams);
