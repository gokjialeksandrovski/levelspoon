import type { EstimatedItem, LoggedItem } from "@/features/lazy-track/actions/lazy-track.utils";
import { scaleNutrition } from "@/lib/nutrition/scale-per-serving";

const PER_100G = 100;

/** Typed text, parsed at commit - same pattern as ingredient-row's amount, so
 * a half-typed "12," is not rejected mid-keystroke. */
export interface ReviewRow {
  item: EstimatedItem;
  gramsText: string;
}

export const toReviewRows = (items: readonly EstimatedItem[]): ReviewRow[] => items.map((item) => ({ item, gramsText: String(item.grams) }));

export const parseGrams = (text: string): number | null => {
  const grams = Number(text.trim().replace(",", "."));
  return text.trim() !== "" && Number.isFinite(grams) && grams > 0 ? grams : null;
};

export const reviewDraftIsLoggable = (rows: readonly ReviewRow[]): boolean =>
  rows.length > 0 && rows.every((row) => parseGrams(row.gramsText) !== null);

export const toLoggedItems = (rows: readonly ReviewRow[]): LoggedItem[] =>
  rows.map((row) => {
    const grams = parseGrams(row.gramsText) ?? row.item.grams;
    return { ...row.item, grams, gramsEdited: grams !== row.item.grams };
  });

export const rowKcal = (row: ReviewRow): number | null => {
  const grams = parseGrams(row.gramsText);
  return grams === null ? null : scaleNutrition(row.item.per100g, grams / PER_100G).energyKcal;
};
