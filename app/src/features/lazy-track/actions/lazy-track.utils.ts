import type { NutritionValues } from "@/types/nutrition";

export interface EstimatedItem {
  name: string;
  grams: number;
  per100g: NutritionValues;
}

export interface MealEstimateView {
  mealName: string;
  items: EstimatedItem[];
}

export interface LoggedItem extends EstimatedItem {
  gramsEdited: boolean;
}

export const DESCRIPTION_MAX_LENGTH = 1000;

// Judgment: a whole family tray bake is ~3 kg; past 5 kg a guess is a typo or
// a unit mix-up, not a meal.
export const MAX_ITEM_GRAMS = 5000;

// Physical: 100 g of food cannot hold more than 100 g of macronutrients.
const MAX_MASS_PER_100G = 100;
// Physical: pure fat is 9 kcal/g (Atwater), the densest food there is.
const MAX_KCAL_PER_100G = 900;

const FALLBACK_MEAL_NAME = "Meal";

const FIGURE_KEYS = ["energyKcal", "fatG", "saturatesG", "carbohydrateG", "sugarsG", "proteinG", "saltG"] as const;

const isNonNegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

const massPer100g = (figures: NutritionValues): number =>
  figures.fatG + figures.carbohydrateG + figures.proteinG + (figures.fibreG ?? 0);

const crossFieldsArePlausible = (figures: NutritionValues): boolean =>
  figures.sugarsG <= figures.carbohydrateG && figures.saturatesG <= figures.fatG;

const figuresArePlausible = (figures: NutritionValues): boolean =>
  FIGURE_KEYS.every((key) => isNonNegative(figures[key])) &&
  (figures.fibreG === null || isNonNegative(figures.fibreG)) &&
  massPer100g(figures) <= MAX_MASS_PER_100G &&
  figures.energyKcal <= MAX_KCAL_PER_100G &&
  crossFieldsArePlausible(figures);

export const isPlausibleItem = (item: EstimatedItem): boolean =>
  item.name.trim().length > 0 && isNonNegative(item.grams) && item.grams > 0 && item.grams <= MAX_ITEM_GRAMS && figuresArePlausible(item.per100g);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const toFigures = (raw: unknown): NutritionValues | null => {
  if (!isRecord(raw)) return null;
  const fibre = raw.fibreG ?? null;
  if (!FIGURE_KEYS.every((key) => typeof raw[key] === "number") || (fibre !== null && typeof fibre !== "number")) return null;
  return {
    energyKcal: raw.energyKcal as number,
    fatG: raw.fatG as number,
    saturatesG: raw.saturatesG as number,
    carbohydrateG: raw.carbohydrateG as number,
    sugarsG: raw.sugarsG as number,
    proteinG: raw.proteinG as number,
    saltG: raw.saltG as number,
    fibreG: fibre as number | null,
  };
};

const toItem = (raw: unknown): EstimatedItem | null => {
  if (!isRecord(raw) || typeof raw.name !== "string" || typeof raw.grams !== "number") return null;
  const per100g = toFigures(raw.per100g);
  return per100g ? { name: raw.name.trim(), grams: raw.grams, per100g } : null;
};

/** Gemini's JSON, or a browser round trip of it, narrowed to items that could
 * be food. Anything else is dropped here rather than refused: one bad item in
 * five should not cost the user the other four. */
export const parseMealEstimate = (raw: unknown): MealEstimateView => {
  if (!isRecord(raw) || !Array.isArray(raw.items)) return { mealName: FALLBACK_MEAL_NAME, items: [] };
  const mealName = typeof raw.mealName === "string" && raw.mealName.trim() ? raw.mealName.trim() : FALLBACK_MEAL_NAME;
  const items = raw.items.map(toItem).filter((item): item is EstimatedItem => item !== null && isPlausibleItem(item));
  return { mealName, items };
};

export const isDescriptionTooLong = (description: string): boolean => description.length > DESCRIPTION_MAX_LENGTH;

export const canEstimate = (description: string, hasPhoto: boolean): boolean =>
  !isDescriptionTooLong(description) && (description.trim().length > 0 || hasPhoto);

export const quantitySourceFor = (gramsEdited: boolean): "ai_estimated" | "manual" => (gramsEdited ? "manual" : "ai_estimated");

/** One wording for every place a guess is marked. */
export const AI_ESTIMATE_TAG = "AI estimate";
export const withAiEstimateTag = (name: string, isAiEstimate: boolean): string => (isAiEstimate ? `${name} (${AI_ESTIMATE_TAG})` : name);
