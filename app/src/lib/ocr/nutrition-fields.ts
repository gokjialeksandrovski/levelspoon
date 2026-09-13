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

// Two decimals, not one: an EU label's own figures (e.g. Salt 0.18g) are
// already exactly what the manufacturer printed - not noise, and salt in
// particular is meaningful to the second decimal - so rounding to one would
// silently discard real label data. Scaling a US per-serving label to
// per-100g produces genuine noise instead (200 kcal over a 37g serving is
// 540.5405405405405); two decimals is still enough to clean that up. This
// also matches the DB columns' own numeric(10, 2) precision - rounding
// tighter than that would already be losing data the schema was built to
// hold. Since these strings are both what the confirm step shows and what
// it saves, this is the one rounding pass for both.
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

// When a save is blocked by fresh flags, move focus to the first flagged
// input so a keyboard or screen-reader user is taken straight to the field
// that needs a fix rather than having to hunt for it after the alert
// (found via /accessibility, 2026-09-10). Field renders <input id={name}>,
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
