import type { NutritionValues } from "@/types/nutrition";

export const ZERO_NUTRITION: NutritionValues = {
  energyKcal: 0,
  fatG: 0,
  saturatesG: 0,
  carbohydrateG: 0,
  sugarsG: 0,
  proteinG: 0,
  saltG: 0,
  fibreG: null,
};

// A sum of what is known. null only when neither side had a figure, so an
// ingredient whose label omitted fibre lowers the coverage count without
// dragging the total down as if it contained none.
const addFibre = (left: number | null, right: number | null): number | null => {
  if (left === null) {
    return right;
  }
  if (right === null) {
    return left;
  }
  return left + right;
};

export const addNutrition = (a: NutritionValues, b: NutritionValues): NutritionValues => ({
  energyKcal: a.energyKcal + b.energyKcal,
  fatG: a.fatG + b.fatG,
  saturatesG: a.saturatesG + b.saturatesG,
  carbohydrateG: a.carbohydrateG + b.carbohydrateG,
  sugarsG: a.sugarsG + b.sugarsG,
  proteinG: a.proteinG + b.proteinG,
  saltG: a.saltG + b.saltG,
  fibreG: addFibre(a.fibreG, b.fibreG),
});

export interface ProductNutritionRow {
  energyKcal: string;
  fatG: string;
  saturatesG: string;
  carbohydrateG: string;
  sugarsG: string;
  proteinG: string;
  saltG: string;
  fibreG: string | null;
}

export const productRowToNutritionValues = (product: ProductNutritionRow): NutritionValues => ({
  energyKcal: Number(product.energyKcal),
  fatG: Number(product.fatG),
  saturatesG: Number(product.saturatesG),
  carbohydrateG: Number(product.carbohydrateG),
  sugarsG: Number(product.sugarsG),
  proteinG: Number(product.proteinG),
  saltG: Number(product.saltG),
  // Number(null) is 0, which would file every unknown fibre as a confident zero.
  fibreG: product.fibreG === null ? null : Number(product.fibreG),
});

export interface FibreCoverage {
  known: number;
  total: number;
}

export const fibreCoverage = (rows: readonly { fibreG: number | string | null }[]): FibreCoverage => ({
  known: rows.filter((row) => row.fibreG !== null).length,
  total: rows.length,
});

// A partial total is a floor, not the day's fibre, so it says how many
// ingredients it covers. Nothing known prints a dash, never a made-up 0g.
export const fibreText = (fibreG: number | null, coverage: FibreCoverage): string => {
  if (fibreG === null) {
    return "Fibre —";
  }
  const figure = `Fibre ${Math.round(fibreG)}g`;
  return coverage.known < coverage.total ? `${figure} (${coverage.known} of ${coverage.total} ingredients)` : figure;
};
