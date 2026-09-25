import type { NutritionValues } from "@/types/nutrition";

import type { NullableNutritionValues } from "./provider";

export const FIELD_LABELS: Record<keyof NullableNutritionValues, string> = {
  energyKcal: "Energy (kcal)",
  fatG: "Fat (g)",
  saturatesG: "Saturates (g)",
  carbohydrateG: "Carbohydrate (g)",
  sugarsG: "Sugars (g)",
  fibreG: "Fibre (g)",
  proteinG: "Protein (g)",
  saltG: "Salt (g)",
};

// The packaging's own blocks, in its own order: an EU label prints saturates
// indented under fat and sugars under carbohydrate, so the form reads in the
// same shape as the label the user is holding. No legends - the field labels
// already name every figure, and spacing carries the grouping.
export const NUTRITION_FIELD_GROUPS: (keyof NullableNutritionValues)[][] = [
  ["energyKcal"],
  ["fatG", "saturatesG"],
  ["carbohydrateG", "sugarsG"],
  // Its own group: the EU label prints fibre under carbohydrate but not
  // indented beneath it, because fibre sits outside the carbohydrate figure.
  ["fibreG"],
  ["proteinG", "saltG"],
];

/** Printed indented under their parent on an EU label ("of which ..."). */
export const INDENTED_FIELDS: ReadonlySet<keyof NullableNutritionValues> = new Set(["saturatesG", "sugarsG"]);

// Matches ocr-service's validate.py flag naming (snake_case field names),
// confirmed directly against its source. fibre_g is one of them: _component_total
// adds it when a known fibre figure pushes the total past 100g, and
// _negative_flags yields it for a negative figure. A flag with no entry here is
// dropped by flaggedFieldSet, so the field would never be highlighted.
export const FLAG_TO_FIELD: Record<string, keyof NullableNutritionValues> = {
  energy_kcal: "energyKcal",
  fat_g: "fatG",
  saturates_g: "saturatesG",
  carbohydrate_g: "carbohydrateG",
  sugars_g: "sugarsG",
  protein_g: "proteinG",
  salt_g: "saltG",
  fibre_g: "fibreG",
};

export type FieldValues = Record<keyof NullableNutritionValues, string>;

// Two decimals, not one: an EU label's own figures (e.g. Salt 0.18g) are
// printed data, not noise - rounding to one digit would discard it. Also
// matches the DB's numeric(10, 2) columns, and this is the one rounding
// pass for both what the confirm step shows and what it saves.
const DISPLAY_DECIMALS = 2;

const toDisplayValue = (value: number | null): string =>
  value === null ? "" : String(Number(value.toFixed(DISPLAY_DECIMALS)));

// Walks the known fields, not the object's own keys: the real OCR service
// omits a figure the label never printed (fibre, most often), and a missing
// key left that field undefined - toNutritionValues' .trim() then threw, and
// the confirm step could neither revalidate nor save.
export const toFieldValues = (parsed: NullableNutritionValues): FieldValues => {
  const fields = Object.keys(FIELD_LABELS) as (keyof NullableNutritionValues)[];
  return Object.fromEntries(fields.map((field) => [field, toDisplayValue(parsed[field] ?? null)])) as FieldValues;
};

export const toNutritionValues = (values: FieldValues): NutritionValues => ({
  energyKcal: Number(values.energyKcal),
  fatG: Number(values.fatG),
  saturatesG: Number(values.saturatesG),
  carbohydrateG: Number(values.carbohydrateG),
  sugarsG: Number(values.sugarsG),
  proteinG: Number(values.proteinG),
  saltG: Number(values.saltG),
  // The only field a user may leave blank: blank is "the label printed none",
  // and Number("") would file that as a confident 0.
  fibreG: values.fibreG.trim() === "" ? null : Number(values.fibreG),
});

export interface NutritionFieldChange {
  field: keyof NullableNutritionValues;
  label: string;
  from: string;
  to: string;
}

// What a correction would actually change, for the preview above Save.
// Compared as numbers, not strings: "2" -> "2.0" is the same figure typed
// differently, and listing it as a change would make the preview untrustworthy.
export const changedNutritionFields = (original: FieldValues, current: FieldValues): NutritionFieldChange[] =>
  (Object.keys(FIELD_LABELS) as (keyof NullableNutritionValues)[])
    .filter((field) => Number(original[field]) !== Number(current[field]))
    .map((field) => ({ field, label: FIELD_LABELS[field], from: original[field], to: current[field] }));

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
