/**
 * Household portions a user can tap instead of weighing, in grams.
 *
 * In code rather than the database for the same reason `densities.ts` gives:
 * these change with releases, not with users, and a pure table is what keeps
 * portion resolution testable without Postgres. A user who disagrees with a
 * figure overrides it per-product (`portion_overrides`) - the table is the
 * default, not the last word.
 *
 * Every figure below is the EDIBLE portion. Shell, rind, and packaging never
 * count: the per-100g nutrition these multiply is stated for edible food.
 */

export interface Portion {
  /** Chip label, and the exact string `resolveQuantity` matches a unit on. */
  label: string;
  /** Grams in one of these. */
  grams: number;
}

/**
 * Three shared shapes, then one class per food that has a cup weight.
 *
 * Cup weight cannot be shared: cooked oatmeal packs 234 g into a cup and
 * cooked white rice 158 g. A single "grain-cup" would hand 48% of the
 * difference to whichever food lost the coin flip.
 */
export type PortionClass =
  | "bread-slice"
  | "cheese-slice"
  | "egg"
  | "cup-rice-white-cooked"
  | "cup-rice-brown-cooked"
  | "cup-pasta-cooked"
  | "cup-oatmeal-cooked"
  | "cup-lentils-cooked"
  | "cup-chickpeas-cooked"
  | "cup-black-beans-cooked"
  | "cup-kidney-beans-cooked"
  | "cup-milk";

const PORTIONS_BY_CLASS: Readonly<Record<PortionClass, readonly Portion[]>> = {
  // USDA FDC commercial white bread: 28 g per regular slice, 38 g for the
  // larger round/toasting loaf. Real slices run 20-45 g, which is exactly
  // why the per-product override exists.
  "bread-slice": [
    { label: "slice", grams: 28 },
    { label: "slice, large", grams: 38 },
  ],
  // Conventional deli/pre-sliced hard cheese slice. Least certain figure in
  // this file - a supermarket pack states 20-25 g per slice depending on
  // cut thickness, and no standard fixes it.
  "cheese-slice": [{ label: "slice", grams: 20 }],
  // EU Reg. 589/2008 grades egg weight IN SHELL: S <53 g, M 53-63, L 63-73,
  // XL >=73. Figures here are the grade midpoint times 0.87 (shell and
  // membrane are ~13% of a whole egg), rounded to the gram. 50 g for M
  // matches the value already carried by fixtures/standard-foods.json.
  egg: [
    { label: "small", grams: 44 },
    { label: "medium", grams: 50 },
    { label: "large", grams: 58 },
    { label: "extra large", grams: 68 },
  ],
  // USDA reference weights for one 240 mL cup of each food, as prepared.
  // A cup stated this way needs no density: the gram weight IS the
  // measurement, which is why these never touch VOLUME_UNITS_TO_ML.
  "cup-rice-white-cooked": [{ label: "cup", grams: 158 }],
  "cup-rice-brown-cooked": [{ label: "cup", grams: 195 }],
  "cup-pasta-cooked": [{ label: "cup", grams: 140 }],
  "cup-oatmeal-cooked": [{ label: "cup", grams: 234 }],
  "cup-lentils-cooked": [{ label: "cup", grams: 198 }],
  "cup-chickpeas-cooked": [{ label: "cup", grams: 164 }],
  "cup-black-beans-cooked": [{ label: "cup", grams: 172 }],
  "cup-kidney-beans-cooked": [{ label: "cup", grams: 177 }],
  "cup-milk": [{ label: "cup", grams: 244 }],
};

export const PORTION_CLASSES = Object.keys(PORTIONS_BY_CLASS) as readonly PortionClass[];

export const portionsForClass = (portionClass: PortionClass): readonly Portion[] =>
  PORTIONS_BY_CLASS[portionClass];
