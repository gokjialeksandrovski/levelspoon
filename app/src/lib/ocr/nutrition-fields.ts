import type { NutritionValues } from "@/actions/products";

import type { NullableNutritionValues } from "./provider";

export const FIELD_LABELS: Record<keyof NullableNutritionValues, string> = {
  energyKcal: "Energy (kcal)",
  fatG: "Fat (g)",
  saturatesG: "Saturates (g)",
  carbohydrateG: "Carbohydrate (g)",
  sugarsG: "Sugars (g)",
  proteinG: "Protein (g)",
  saltG: "Salt (g)",
};

// Matches ocr-service's validate.py flag naming (snake_case field names),
// confirmed directly against its source during planning.
export const FLAG_TO_FIELD: Record<string, keyof NullableNutritionValues> = {
  energy_kcal: "energyKcal",
  fat_g: "fatG",
  saturates_g: "saturatesG",
  carbohydrate_g: "carbohydrateG",
  sugars_g: "sugarsG",
  protein_g: "proteinG",
  salt_g: "saltG",
};

export type FieldValues = Record<keyof NullableNutritionValues, string>;

export const toFieldValues = (parsed: NullableNutritionValues): FieldValues => {
  const entries = Object.entries(parsed) as [keyof NullableNutritionValues, number | null][];
  const stringEntries = entries.map(([key, value]) => [key, value === null ? "" : String(value)] as const);
  return Object.fromEntries(stringEntries) as FieldValues;
};

export const toNutritionValues = (values: FieldValues): NutritionValues => ({
  energyKcal: Number(values.energyKcal),
  fatG: Number(values.fatG),
  saturatesG: Number(values.saturatesG),
  carbohydrateG: Number(values.carbohydrateG),
  sugarsG: Number(values.sugarsG),
  proteinG: Number(values.proteinG),
  saltG: Number(values.saltG),
});

export const flaggedFieldSet = (flags: string[]): Set<keyof NullableNutritionValues> =>
  new Set(
    flags
      .map((flag) => FLAG_TO_FIELD[flag])
      .filter((field): field is keyof NullableNutritionValues => Boolean(field)),
  );
