import type { RecentAmount } from "@/features/meals/actions/meals";
import type { Portion } from "@/lib/measures/portions";

/** One tappable amount: a count, the unit it is counted in, and what that weighs. */
export interface AmountChip {
  count: number;
  unit: string;
  grams: number;
}

/** A portion is offered singly. Multiples come from what the user actually logged. */
export const portionChips = (portions: readonly Portion[]): AmountChip[] =>
  portions.map((portion) => ({ count: 1, unit: portion.label, grams: portion.grams }));

/**
 * One row, recents first.
 *
 * A recent entry replaces the portion chip for the same unit rather than
 * sitting beside it: two chips reading "1 slice · 28 g" and "1 slice · 32 g"
 * ask the user to spot a four-gram difference to understand why both exist.
 * The recent one wins because it is what this user actually logged.
 */
export const mergeChips = (
  recents: readonly RecentAmount[],
  portions: readonly Portion[],
): AmountChip[] => {
  const recentUnits = new Set(recents.map((recent) => recent.unit));
  return [
    ...recents.map((recent) => ({ count: recent.count, unit: recent.unit, grams: recent.grams })),
    ...portionChips(portions).filter((chip) => !recentUnits.has(chip.unit)),
  ];
};

// A gram chip already states its weight in its count - printing "100 g · 100 g"
// reads as a bug.
export const chipLabel = (chip: AmountChip): string =>
  chip.unit === "g"
    ? `${chip.count} g`
    : `${chip.count} ${chip.unit} · ${Math.round(chip.grams)} g`;

export const isChipSelected = (chip: AmountChip, count: string, unit: string): boolean => {
  const typed = Number(count.trim());
  return count.trim() !== "" && Number.isFinite(typed) && typed === chip.count && unit === chip.unit;
};

/**
 * What a logged amount reads as on the meal detail.
 *
 * A row saved as "1 slice" stores 28 g, because grams is what nutrition
 * scales from. Printing only the 28 g throws away the sentence the user
 * actually said, and makes tomorrow's edit start from a number they have to
 * re-derive. Nulls mean a row written before the entry columns existed.
 */
export const quantityText = (
  quantity: number,
  quantityUnit: string,
  entryCount: number | null,
  entryUnit: string | null,
): string => {
  if (entryCount === null || entryUnit === null || entryUnit === quantityUnit) {
    return `${quantity} ${quantityUnit}`;
  }
  return `${entryCount} ${entryUnit} · ${Math.round(quantity)} ${quantityUnit}`;
};
