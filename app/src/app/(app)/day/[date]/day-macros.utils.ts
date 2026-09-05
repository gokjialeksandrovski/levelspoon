// Atwater factors (kcal per gram) - mirrors
// ocr-service/src/per100_ocr/nutrition/validate.py's KCAL_PER_G_* constants.
// Duplicated rather than shared across the Python/TypeScript boundary,
// which has no shared-code mechanism in this repo.
const KCAL_PER_G_PROTEIN = 4;
const KCAL_PER_G_CARBOHYDRATE = 4;
const KCAL_PER_G_FAT = 9;

export interface MacroCalorieShares {
  protein: number;
  carbs: number;
  fat: number;
}

interface MacroGrams {
  proteinG: number;
  carbohydrateG: number;
  fatG: number;
}

// Shares are computed from the macros' own calorie contribution, not from
// the day's displayed energyKcal total (which is label-sourced and won't
// exactly equal 4P+4C+9F) - this is what makes the shares sum to exactly 1,
// so the segmented rule always spans the full width with no gap (spec §4.2).
export const macroCalorieShares = (total: MacroGrams): MacroCalorieShares => {
  const proteinKcal = total.proteinG * KCAL_PER_G_PROTEIN;
  const carbsKcal = total.carbohydrateG * KCAL_PER_G_CARBOHYDRATE;
  const fatKcal = total.fatG * KCAL_PER_G_FAT;
  const totalKcal = proteinKcal + carbsKcal + fatKcal;

  if (totalKcal === 0) {
    return { protein: 0, carbs: 0, fat: 0 };
  }

  return {
    protein: proteinKcal / totalKcal,
    carbs: carbsKcal / totalKcal,
    fat: fatKcal / totalKcal,
  };
};
