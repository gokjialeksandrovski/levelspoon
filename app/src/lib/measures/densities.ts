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

/** The seeded density for a product name, or null when unknown or ambiguous. */
export const seededDensity = (productName: string): number | null => {
  const survivors = mostSpecific(matchingKeys(tokensOf(productName)));
  return survivors.length === 1 ? SEEDED_DENSITIES_G_ML[survivors[0]] : null;
};
