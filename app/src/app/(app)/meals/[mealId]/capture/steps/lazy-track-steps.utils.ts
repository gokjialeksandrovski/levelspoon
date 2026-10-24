import { MAX_ITEM_GRAMS, type EstimatedItem, type LoggedItem } from "@/features/lazy-track/actions/lazy-track.utils";
import { scaleNutrition } from "@/lib/nutrition/scale-per-serving";

const PER_100G = 100;

const GRAMS_TOO_LOW_ERROR = "Enter an amount above 0.";
const GRAMS_TOO_HIGH_ERROR = `Enter ${MAX_ITEM_GRAMS} g or less.`;

/** Typed text, parsed at commit - same pattern as ingredient-row's amount, so
 * a half-typed "12," is not rejected mid-keystroke. */
export interface ReviewRow {
  item: EstimatedItem;
  gramsText: string;
}

export const toReviewRows = (items: readonly EstimatedItem[]): ReviewRow[] => items.map((item) => ({ item, gramsText: String(item.grams) }));

// Unbounded parse, so gramsFieldError below can tell "too low" from "too high"
// - parseGrams alone collapses both to null, which is fine for validity but
// not for the copy shown at the field.
const parsedGramsValue = (text: string): number | null => {
  const grams = Number(text.trim().replace(",", "."));
  return text.trim() !== "" && Number.isFinite(grams) ? grams : null;
};

export const parseGrams = (text: string): number | null => {
  const grams = parsedGramsValue(text);
  return grams !== null && grams > 0 && grams <= MAX_ITEM_GRAMS ? grams : null;
};

// Server refuses this same value as invalid_items with a generic "estimate
// again" message - the field error here catches it first with copy that
// names the actual limit, so the user isn't sent back to re-estimate for a
// typo.
export const gramsFieldError = (text: string): string | undefined => {
  const grams = parsedGramsValue(text);
  if (grams !== null && grams > MAX_ITEM_GRAMS) return GRAMS_TOO_HIGH_ERROR;
  return grams !== null && grams > 0 ? undefined : GRAMS_TOO_LOW_ERROR;
};

export const reviewDraftIsLoggable = (rows: readonly ReviewRow[]): boolean =>
  rows.length > 0 && rows.every((row) => parseGrams(row.gramsText) !== null);

export const toLoggedItems = (rows: readonly ReviewRow[]): LoggedItem[] =>
  rows.map((row) => {
    const grams = parseGrams(row.gramsText) ?? row.item.grams;
    return { ...row.item, grams, gramsEdited: grams !== row.item.grams };
  });

export const droppedItemsNotice = (count: number): string =>
  count === 1
    ? "1 item was left out because its figures didn't add up. Add it by search after logging."
    : `${count} items were left out because their figures didn't add up. Add them by search after logging.`;

export const rowKcal = (row: ReviewRow): number | null => {
  const grams = parseGrams(row.gramsText);
  return grams === null ? null : scaleNutrition(row.item.per100g, grams / PER_100G).energyKcal;
};
