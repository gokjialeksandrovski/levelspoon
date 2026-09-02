/**
 * Physical and legal constants for label measurements. These live in code and
 * never in the database: a database row invites mutation of a constant and
 * costs a query to perform a multiplication.
 */

export const MASS_UNITS_TO_GRAMS: Readonly<Record<string, number>> = {
  mg: 0.001,
  g: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
};

// FDA 21 CFR 101.9(b)(5) labeling equivalents, not true US customary units.
// `fl oz` is 30 mL here, not the true fluid ounce's 29.5735: only the FDA set
// preserves the 8-fl-oz-per-cup relationship that a 240 mL labeling cup
// assumes, and every input to this engine is a nutrition label serving size.
// Do not "correct" this to 29.5735.
export const VOLUME_UNITS_TO_ML: Readonly<Record<string, number>> = {
  tsp: 5,
  tbsp: 15,
  "fl oz": 30,
  cup: 240,
  pint: 473.176,
  quart: 946.353,
  l: 1000,
  ml: 1,
};

// Every spelling a label or a user might print, mapped to the canonical name
// used as a key in the two tables above.
const ALIASES_BY_CANONICAL: Readonly<Record<string, readonly string[]>> = {
  mg: ["mg", "milligram", "milligrams"],
  g: ["g", "gram", "grams"],
  kg: ["kg", "kilogram", "kilograms"],
  oz: ["oz", "ounce", "ounces"],
  lb: ["lb", "lbs", "pound", "pounds"],
  tsp: ["tsp", "tsps", "teaspoon", "teaspoons"],
  tbsp: ["tbsp", "tbsps", "tbs", "tablespoon", "tablespoons"],
  "fl oz": ["fl oz", "fl. oz", "fl.oz", "floz", "fluid ounce", "fluid ounces"],
  cup: ["cup", "cups"],
  pint: ["pint", "pints"],
  quart: ["quart", "quarts"],
  l: ["l", "litre", "litres", "liter", "liters"],
  ml: ["ml", "millilitre", "millilitres", "milliliter", "milliliters"],
};

const CANONICAL_BY_ALIAS = new Map(
  Object.entries(ALIASES_BY_CANONICAL).flatMap(([canonical, aliases]) =>
    aliases.map((alias) => [alias, canonical] as const),
  ),
);

/** Longest alias first, so "fl oz" is tried before "oz" and "tablespoons" before "tbs". */
export const KNOWN_ALIASES: readonly string[] = [...CANONICAL_BY_ALIAS.keys()].sort(
  (left, right) => right.length - left.length,
);

export const canonicalUnit = (token: string): string | null =>
  CANONICAL_BY_ALIAS.get(token.trim().toLowerCase()) ?? null;
