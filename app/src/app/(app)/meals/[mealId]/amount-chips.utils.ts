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
