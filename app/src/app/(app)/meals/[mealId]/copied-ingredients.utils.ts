import type { MealIngredientDetail } from "@/features/meals/actions/meals";
import type { PasteItem } from "@/features/meals/actions/meals.utils";

/** One copied row, snapshot at copy time: editing or removing the source row
 * later leaves the entry as copied, so the list shows what paste will write. */
export interface CopiedIngredient {
  /** meal_ingredients.id; drives the row's Copy/Copied toggle. */
  sourceIngredientId: string;
  productId: string;
  /** Display only. */
  productName: string;
  quantity: number;
  quantityUnit: string;
  entryCount: number | null;
  entryUnit: string | null;
  quantitySource: "ai_estimated" | "manual";
  /** Display only, rounded at render. The pasted row reads live nutrition. */
  energyKcal: number;
  /** Display only. */
  isAiEstimate: boolean;
}

// Keyed by user so a shared device never offers one account's rows to
// another. No user yet (session loading) means no key, never ":undefined".
export const copiedStorageKey = (userId: string | undefined): string | null =>
  userId === undefined ? null : `levelspoon:copied:${userId}`;

export const toCopiedIngredient = (ingredient: MealIngredientDetail): CopiedIngredient => ({
  sourceIngredientId: ingredient.id,
  productId: ingredient.productId,
  productName: ingredient.productName,
  quantity: ingredient.quantity,
  quantityUnit: ingredient.quantityUnit,
  entryCount: ingredient.entryCount,
  entryUnit: ingredient.entryUnit,
  quantitySource: ingredient.quantitySource,
  energyKcal: ingredient.contribution.energyKcal,
  isAiEstimate: ingredient.isAiEstimate,
});

export const isCopied = (items: readonly CopiedIngredient[], sourceIngredientId: string): boolean =>
  items.some((item) => item.sourceIngredientId === sourceIngredientId);

export const dropSource = (
  items: readonly CopiedIngredient[],
  sourceIngredientId: string,
): readonly CopiedIngredient[] => items.filter((item) => item.sourceIngredientId !== sourceIngredientId);

export const toggleRow = (
  items: readonly CopiedIngredient[],
  ingredient: MealIngredientDetail,
): readonly CopiedIngredient[] =>
  isCopied(items, ingredient.id) ? dropSource(items, ingredient.id) : [...items, toCopiedIngredient(ingredient)];

export const isMealCopied = (
  items: readonly CopiedIngredient[],
  ingredients: readonly MealIngredientDetail[],
): boolean => ingredients.length > 0 && ingredients.every((ingredient) => isCopied(items, ingredient.id));

// Fully copied: take this meal's rows off, leave other meals' entries. Else
// add only the rows not yet copied, so none appears twice.
export const toggleMeal = (
  items: readonly CopiedIngredient[],
  ingredients: readonly MealIngredientDetail[],
): readonly CopiedIngredient[] => {
  if (isMealCopied(items, ingredients)) {
    const mealRowIds = new Set(ingredients.map((ingredient) => ingredient.id));
    return items.filter((item) => !mealRowIds.has(item.sourceIngredientId));
  }
  const missing = ingredients.filter((ingredient) => !isCopied(items, ingredient.id));
  return [...items, ...missing.map(toCopiedIngredient)];
};

// By product, not by source row: one product copied from two rows is
// unavailable in both.
export const dropProducts = (
  items: readonly CopiedIngredient[],
  productIds: readonly string[],
): readonly CopiedIngredient[] => {
  const dropped = new Set(productIds);
  return items.filter((item) => !dropped.has(item.productId));
};

const isString = (value: unknown): boolean => typeof value === "string";
const isNumber = (value: unknown): boolean => typeof value === "number";
const isNumberOrNull = (value: unknown): boolean => value === null || isNumber(value);
const isStringOrNull = (value: unknown): boolean => value === null || isString(value);

// Keyed by every field, so a field added to CopiedIngredient fails to compile
// until it has a check here.
const FIELD_CHECKS: Record<keyof CopiedIngredient, (value: unknown) => boolean> = {
  sourceIngredientId: isString,
  productId: isString,
  productName: isString,
  quantity: isNumber,
  quantityUnit: isString,
  entryCount: isNumberOrNull,
  entryUnit: isStringOrNull,
  quantitySource: (value) => value === "ai_estimated" || value === "manual",
  energyKcal: isNumber,
  isAiEstimate: (value) => typeof value === "boolean",
};

const isCopiedIngredient = (value: unknown): value is CopiedIngredient =>
  typeof value === "object" &&
  value !== null &&
  Object.entries(FIELD_CHECKS).every(([field, check]) => check((value as Record<string, unknown>)[field]));

// Storage is outside the app's control (another version, a hand edit), so an
// unreadable value reads as an empty list and a bad entry is dropped alone.
export const parseCopied = (raw: string | null): readonly CopiedIngredient[] => {
  if (raw === null) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isCopiedIngredient) : [];
  } catch {
    return [];
  }
};

export const toPasteItems = (items: readonly CopiedIngredient[]): PasteItem[] =>
  items.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
    quantityUnit: item.quantityUnit,
    entryCount: item.entryCount,
    entryUnit: item.entryUnit,
    quantitySource: item.quantitySource,
  }));

export const ingredientCount = (count: number): string =>
  count === 1 ? "1 ingredient" : `${count} ingredients`;

export const pasteLabel = (count: number): string => (count === 1 ? "Paste" : `Paste all ${count}`);

const droppedSentence = (droppedCount: number): string =>
  droppedCount === 1
    ? "1 copied item is no longer available and was taken off the list."
    : `${droppedCount} copied items are no longer available and were taken off the list.`;

export const unavailableMessage = (droppedCount: number, remainingCount: number): string =>
  remainingCount > 0 ? `${droppedSentence(droppedCount)} Paste the rest again.` : droppedSentence(droppedCount);
