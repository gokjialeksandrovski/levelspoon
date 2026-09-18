import { portionClassForName, portionClassForSlug } from "./portion-class";
import { portionsForClass, type Portion } from "./portions";

/**
 * Everything needed to decide one product's portions. A DTO builder fills
 * this from a database row; nothing here reads the database itself, which
 * is what keeps the whole path testable without Postgres.
 */
export interface PortionSource {
  standardSlug: string | null;
  nameSearch: string;
  servingUnit: string | null;
  servingGrams: number | null;
  nutritionBasisUnit: string;
  /** This user's gram figures keyed by portion label, from `portion_overrides`. */
  overrides: Readonly<Record<string, number>>;
}

// Slug first: a curated food states its shape, a name only suggests one.
const classOf = (source: PortionSource) =>
  portionClassForSlug(source.standardSlug) ?? portionClassForName(source.nameSearch);

// Most specific figure wins. The user's own correction beats what this
// product's label taught, which beats the class default - the class figure
// is what to show when nothing more specific exists, never an override of
// something that does.
const gramsFor = (portion: Portion, source: PortionSource): number => {
  const override = source.overrides[portion.label];
  if (override !== undefined) {
    return override;
  }
  if (source.servingUnit === portion.label && source.servingGrams !== null) {
    return source.servingGrams;
  }
  return portion.grams;
};

/** The portions this user should see for this product, in display order. */
export const resolvePortions = (source: PortionSource): readonly Portion[] => {
  if (source.nutritionBasisUnit !== "g") {
    return [];
  }
  const portionClass = classOf(source);
  if (portionClass === null) {
    return [];
  }
  return portionsForClass(portionClass).map((portion) => ({
    label: portion.label,
    grams: gramsFor(portion, source),
  }));
};
