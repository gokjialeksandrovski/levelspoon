export interface MacroShares {
  protein: number;
  carbs: number;
  fat: number;
}

interface MacroGrams {
  proteinG: number;
  carbohydrateG: number;
  fatG: number;
}

// Shares are computed from gram weight, matching the numbers printed right
// next to each figure (P/C/F show grams, not calories) - sizing by calorie
// contribution instead made fat's segment the largest on screens where fat
// had the *fewest* grams of the three, which reads as a bug rather than a
// deliberate calorie-weighting the UI never explains (found via /critique
// on a live screenshot, 2026-09-06). Gram shares still sum to exactly 1, so
// the segmented rule keeps spanning the full width with no gap (spec §4.2).
export const macroGramShares = (total: MacroGrams): MacroShares => {
  const totalG = total.proteinG + total.carbohydrateG + total.fatG;

  if (totalG === 0) {
    return { protein: 0, carbs: 0, fat: 0 };
  }

  return {
    protein: total.proteinG / totalG,
    carbs: total.carbohydrateG / totalG,
    fat: total.fatG / totalG,
  };
};
