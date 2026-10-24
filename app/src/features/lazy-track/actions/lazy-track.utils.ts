import type { NutritionValues } from "@/types/nutrition";

/** Alcohol is read by the bounds only: no products column holds it, so it is
 * dropped at log. Without it a drink's kcal cannot be checked against its macros. */
export interface EstimatedNutrition extends NutritionValues {
  alcoholG: number;
}

export interface EstimatedItem {
  name: string;
  grams: number;
  per100g: EstimatedNutrition;
}

export interface MealEstimateView {
  mealName: string;
  items: EstimatedItem[];
  /** Items Gemini returned that failed the bounds below, so the review can
   * say the meal is short rather than log it short in silence. */
  droppedCount: number;
}

export interface LoggedItem extends EstimatedItem {
  gramsEdited: boolean;
}

export const DESCRIPTION_MAX_LENGTH = 1000;

// Judgment: a whole family tray bake is ~3 kg; past 5 kg a guess is a typo or
// a unit mix-up, not a meal.
export const MAX_ITEM_GRAMS = 5000;

// Physical: 100 g of food cannot hold more than 100 g of fat + carbs +
// protein + salt + alcohol (see massPer100g for why fibre is excluded).
const MAX_MASS_PER_100G = 100;
// Physical: pure fat is 9 kcal/g (Atwater), the densest food there is.
const MAX_KCAL_PER_100G = 900;
// Judgment: model figures are rounded, so a real food sitting on a physical
// limit must still pass - USDA lists lard at 902 kcal per 100 g, and oil can
// read fat 100 + protein 0.2.
const ROUNDING_SLACK_G = 1;
const ROUNDING_SLACK_KCAL = 10;

// Physical: Atwater factors, kcal per gram.
const KCAL_PER_G_FAT = 9;
const KCAL_PER_G_ALCOHOL = 7;
const KCAL_PER_G_CARBOHYDRATE_OR_PROTEIN = 4;
const KCAL_PER_G_FIBRE = 2;
// Judgment: lowest share of its macros' energy a stated kcal may fall to.
// Polyols and rounding pull a real food a little under; a per-100 g kcal set
// beside per-serving macros falls far under, and the user, who can edit only
// grams, could never correct it.
const MIN_KCAL_SHARE_OF_MACRO_ENERGY = 0.75;
// Judgment: highest multiple of its macros' energy a stated kcal may reach.
// Food-specific Atwater factors run up to ~9% over the general ones (egg
// protein 4.36 kcal/g); a per-serving kcal beside per-100 g macros runs far over.
const MAX_KCAL_SHARE_OF_MACRO_ENERGY = 1.2;
// Judgment: energy no field shows, plus rounding. Cider vinegar is 21 kcal per
// 100 g with under 1 g of macros (USDA): acetic acid carries it.
const UNTRACKED_KCAL = 25;

const FALLBACK_MEAL_NAME = "Meal";

const FIGURE_KEYS = ["energyKcal", "fatG", "saturatesG", "carbohydrateG", "sugarsG", "proteinG", "saltG", "alcoholG"] as const;

const isNonNegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

// Fibre excluded on purpose: EU-style carbohydrateG already excludes it, and
// US-style carbohydrateG already includes it, so EU carbs + fibre <= US total
// carbs always holds. Summing fibre again on top of a US-style reply would
// double-count it and drop real foods - peanut butter (fat 50, carbs 20
// incl. 6 fibre, protein 25) is 95 g, not 101 g. Salt and alcohol count: both
// are mass, and the sum is what catches sodium milligrams landing in saltG.
const massPer100g = (figures: EstimatedNutrition): number =>
  figures.fatG + figures.carbohydrateG + figures.proteinG + figures.saltG + figures.alcoholG;

const nonCarbohydrateKcal = (figures: EstimatedNutrition): number =>
  KCAL_PER_G_FAT * figures.fatG + KCAL_PER_G_ALCOHOL * figures.alcoholG + KCAL_PER_G_CARBOHYDRATE_OR_PROTEIN * figures.proteinG;

// Two readings of carbohydrate, because a reply may be US-style (fibre inside
// carbohydrateG) or EU-style (fibre beside it). The floor takes fibre off at
// no energy, the ceiling adds it on at 2 kcal/g: each misreading only loosens
// its own bound.
const minCarbohydrateKcal = (figures: EstimatedNutrition): number =>
  KCAL_PER_G_CARBOHYDRATE_OR_PROTEIN * Math.max(0, figures.carbohydrateG - (figures.fibreG ?? 0));

const maxCarbohydrateKcal = (figures: EstimatedNutrition): number =>
  KCAL_PER_G_CARBOHYDRATE_OR_PROTEIN * figures.carbohydrateG + KCAL_PER_G_FIBRE * (figures.fibreG ?? 0);

const energyMatchesMacros = (figures: EstimatedNutrition): boolean => {
  const fixedKcal = nonCarbohydrateKcal(figures);
  return (
    figures.energyKcal + ROUNDING_SLACK_KCAL >= MIN_KCAL_SHARE_OF_MACRO_ENERGY * (fixedKcal + minCarbohydrateKcal(figures)) &&
    figures.energyKcal <= MAX_KCAL_SHARE_OF_MACRO_ENERGY * (fixedKcal + maxCarbohydrateKcal(figures)) + UNTRACKED_KCAL
  );
};

const fibreIsPlausible = (fibreG: number | null): boolean =>
  fibreG === null || (isNonNegative(fibreG) && fibreG <= MAX_MASS_PER_100G + ROUNDING_SLACK_G);

const withinPhysicalLimits = (figures: EstimatedNutrition): boolean =>
  massPer100g(figures) <= MAX_MASS_PER_100G + ROUNDING_SLACK_G && figures.energyKcal <= MAX_KCAL_PER_100G + ROUNDING_SLACK_KCAL;

const crossFieldsArePlausible = (figures: EstimatedNutrition): boolean =>
  figures.sugarsG <= figures.carbohydrateG + ROUNDING_SLACK_G && figures.saturatesG <= figures.fatG + ROUNDING_SLACK_G;

const figuresArePlausible = (figures: EstimatedNutrition): boolean =>
  FIGURE_KEYS.every((key) => isNonNegative(figures[key])) &&
  fibreIsPlausible(figures.fibreG) &&
  withinPhysicalLimits(figures) &&
  crossFieldsArePlausible(figures) &&
  energyMatchesMacros(figures);

export const isPlausibleItem = (item: EstimatedItem): boolean =>
  item.name.trim().length > 0 && isNonNegative(item.grams) && item.grams > 0 && item.grams <= MAX_ITEM_GRAMS && figuresArePlausible(item.per100g);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const toFigures = (raw: unknown): EstimatedNutrition | null => {
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
    alcoholG: raw.alcoholG as number,
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
  if (!isRecord(raw) || !Array.isArray(raw.items)) return { mealName: FALLBACK_MEAL_NAME, items: [], droppedCount: 0 };
  const mealName = typeof raw.mealName === "string" && raw.mealName.trim() ? raw.mealName.trim() : FALLBACK_MEAL_NAME;
  const items = raw.items.map(toItem).filter((item): item is EstimatedItem => item !== null && isPlausibleItem(item));
  return { mealName, items, droppedCount: raw.items.length - items.length };
};

export const isDescriptionTooLong = (description: string): boolean => description.length > DESCRIPTION_MAX_LENGTH;

export const canEstimate = (description: string, hasPhoto: boolean): boolean =>
  !isDescriptionTooLong(description) && (description.trim().length > 0 || hasPhoto);

export const quantitySourceFor = (gramsEdited: boolean): "ai_estimated" | "manual" => (gramsEdited ? "manual" : "ai_estimated");

/** One wording for every place a guess is marked. */
export const AI_ESTIMATE_TAG = "AI estimate";
export const withAiEstimateTag = (name: string, isAiEstimate: boolean): string => (isAiEstimate ? `${name} (${AI_ESTIMATE_TAG})` : name);
