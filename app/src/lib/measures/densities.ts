/**
 * Curated reference densities in g/mL. These live in code rather than the
 * database because they change with releases, not with users - and keeping
 * them in code is what makes `resolveGrams` a pure function, which is the
 * whole reason for choosing a deterministic pipeline over an AI one.
 *
 * Values are the conventional cooking-reference figures for each ingredient
 * (USDA / standard cookery tables); they are approximate by nature, and a
 * density learned from a product's own label always takes precedence.
 */
const SEEDED_DENSITIES_G_ML: Readonly<Record<string, number>> = {
  water: 1.0,
  milk: 1.03,
  oil: 0.92,
  butter: 0.95,
  sugar: 0.85,
  "brown sugar": 0.93,
  flour: 0.53,
  honey: 1.42,
  "rolled oats": 0.41,
};

const tokensOf = (text: string): string[] => text.toLowerCase().match(/[a-z]+/g) ?? [];

const isSubsetOf = (inner: readonly string[], outer: readonly string[]): boolean =>
  inner.length < outer.length && inner.every((token) => outer.includes(token));

const matchingKeys = (nameTokens: readonly string[]): string[] =>
  Object.keys(SEEDED_DENSITIES_G_ML).filter((key) =>
    tokensOf(key).every((keyToken) => nameTokens.includes(keyToken)),
  );

// "Light Brown Sugar" matches both `brown sugar` and `sugar`; the more
// specific key is the intended one, so a key whose tokens are a strict subset
// of another match is dropped. "Butter Milk" matches two unrelated keys and
// stays ambiguous - unresolved, not a coin flip.
const mostSpecific = (keys: readonly string[]): string[] => {
  const tokenSets = keys.map(tokensOf);
  return keys.filter(
    (_key, index) => !tokenSets.some((other) => isSubsetOf(tokenSets[index], other)),
  );
};

const seededKey = (productName: string): string | null => {
  const survivors = mostSpecific(matchingKeys(tokensOf(productName)));
  return survivors.length === 1 ? survivors[0] : null;
};

/** The seeded density for a product name, or null when unknown or ambiguous. */
export const seededDensity = (productName: string): number | null => {
  const key = seededKey(productName);
  return key === null ? null : SEEDED_DENSITIES_G_ML[key];
};

// A levelled spoon of a dry good weighs close to what its density says - it is
// small enough that packing barely moves it. A cup is sixteen tablespoons and
// its weight moves with how hard it was filled: a cup of brown sugar is 213 g
// packed and about 145 g scooped loose. These names keep tbsp/tsp and get cup
// as a measured portion in portions.ts instead (docs/DECISIONS.md, 2026-09-18).
const LOOSE_SOLID_KEYS = new Set(["sugar", "brown sugar", "flour", "rolled oats"]);

/** Whether a name's density comes from the seeded table AND is a dry good. */
export const isLooseSolid = (productName: string): boolean => {
  const key = seededKey(productName);
  return key !== null && LOOSE_SOLID_KEYS.has(key);
};
