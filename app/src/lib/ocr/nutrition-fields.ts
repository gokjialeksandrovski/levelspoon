import type { NutritionValues } from "@/types/nutrition";

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

// Two decimals, not one: an EU label's own figures (e.g. Salt 0.18g) are
// printed data, not noise - rounding to one digit would discard it. Also
// matches the DB's numeric(10, 2) columns, and this is the one rounding
// pass for both what the confirm step shows and what it saves.
const DISPLAY_DECIMALS = 2;

const toDisplayValue = (value: number | null): string =>
  value === null ? "" : String(Number(value.toFixed(DISPLAY_DECIMALS)));

export const toFieldValues = (parsed: NullableNutritionValues): FieldValues => {
  const entries = Object.entries(parsed) as [keyof NullableNutritionValues, number | null][];
  const stringEntries = entries.map(([key, value]) => [key, toDisplayValue(value)] as const);
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

// Moves focus to the first flagged input so a keyboard/screen-reader user
// lands on the field that needs fixing. Field renders <input id={name}>,
// so the flag name is the element id.
export const focusFirstFlagged = (flags: string[]): void => {
  const flaggedFields = flaggedFieldSet(flags);
  const first = (Object.keys(FIELD_LABELS) as (keyof NullableNutritionValues)[]).find((field) =>
    flaggedFields.has(field),
  );
  if (first) {
    document.getElementById(first)?.focus();
  }
};
