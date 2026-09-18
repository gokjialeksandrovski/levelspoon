import type { PortionClass } from "./portions";

/**
 * Which portion shape a product has, decided two ways.
 *
 * A curated standard food states it outright through its slug. A packaged
 * product OCR'd from a label states nothing, so its romanized name is read
 * for a token that names a shape. The second route is a guess, and it is
 * only safe because of what sits around it: a wrong guess costs one tap to
 * correct in the portion editor, and no match at all falls back to whatever
 * the label itself taught.
 */

const CLASS_BY_SLUG: Readonly<Record<string, PortionClass>> = {
  "bread-white": "bread-slice",
  "bread-whole-wheat": "bread-slice",
  "rye-bread": "bread-slice",
  "cheddar-cheese": "cheese-slice",
  "mozzarella-cheese": "cheese-slice",
  "parmesan-cheese": "cheese-slice",
  "egg-whole-raw": "egg",
  "egg-boiled": "egg",
  "rice-white-cooked": "cup-rice-white-cooked",
  "rice-brown-cooked": "cup-rice-brown-cooked",
  "pasta-cooked": "cup-pasta-cooked",
  "oatmeal-cooked": "cup-oatmeal-cooked",
  "lentils-cooked": "cup-lentils-cooked",
  "chickpeas-cooked": "cup-chickpeas-cooked",
  "black-beans-cooked": "cup-black-beans-cooked",
  "kidney-beans-cooked": "cup-kidney-beans-cooked",
  "milk-whole": "cup-milk",
  "milk-skim": "cup-milk",
};

// Only shapes, never cup classes. A cup weight is per-food and the token that
// would find it ("rice", "milk") sits on plenty of foods nobody measures in
// cups - rice cakes, rice flour, milk chocolate.
const NAME_TOKENS_BY_CLASS: Readonly<Partial<Record<PortionClass, readonly string[]>>> = {
  "bread-slice": ["bread"],
  "cheese-slice": ["cheese"],
  egg: ["egg"],
};

// Only multi-word forms need listing. Token matching compares whole tokens,
// so "gingerbread" and "breadsticks" are already different tokens from
// "bread" and never match. "Noodles, egg, cooked" is a real fixture row.
const EXCLUDED_TOKENS_BY_CLASS: Readonly<Partial<Record<PortionClass, readonly string[]>>> = {
  // "pita" is not hypothetical: fixtures/standard-foods.json carries "Pita
  // bread", which is sold by the piece and already states servingUnit
  // "piece", 60 g. A slice chip on it would be wrong twice over.
  "bread-slice": ["crumb", "crumbs", "flour", "sauce", "pudding", "mix", "dough", "pita"],
  "cheese-slice": ["cream", "cottage", "spread", "sauce", "powder", "dip", "curd"],
  egg: ["noodle", "noodles", "white", "whites", "yolk", "yolks", "powder", "substitute"],
};

const tokensOf = (text: string): string[] => text.toLowerCase().match(/[a-z]+/g) ?? [];

const matchesClass = (portionClass: PortionClass, nameTokens: readonly string[]): boolean => {
  const required = NAME_TOKENS_BY_CLASS[portionClass] ?? [];
  const excluded = EXCLUDED_TOKENS_BY_CLASS[portionClass] ?? [];
  return (
    required.every((token) => nameTokens.includes(token)) &&
    !excluded.some((token) => nameTokens.includes(token))
  );
};

export const portionClassForSlug = (standardSlug: string | null): PortionClass | null =>
  standardSlug === null ? null : CLASS_BY_SLUG[standardSlug] ?? null;

/**
 * The one class a romanized name names, or null.
 *
 * Two matches is no match. "Cheese and egg sandwich" is not a slice of
 * cheese and not an egg, and picking either would attach a gram figure the
 * user never asked for - the same reason `seededDensity` refuses "Butter
 * Milk".
 */
export const portionClassForName = (nameSearch: string): PortionClass | null => {
  const nameTokens = tokensOf(nameSearch);
  const matches = (Object.keys(NAME_TOKENS_BY_CLASS) as PortionClass[]).filter((portionClass) =>
    matchesClass(portionClass, nameTokens),
  );
  return matches.length === 1 ? matches[0] : null;
};
