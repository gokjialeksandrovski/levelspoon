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

// Shares are gram-based, matching the numbers printed next to each figure -
// sizing by calorie contribution instead could make fat's segment largest
// while fat has the fewest grams, reading as a bug (spec §4.2).
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
