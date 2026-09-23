// Shared across features/products and lib/ (ocr parsing, quantity/nutrition
// scaling) — lives here, not in features/products, so lib/ can use it
// without importing across the features/ boundary (CLAUDE.md Rule 20).
export interface NutritionValues {
  energyKcal: number;
  fatG: number;
  saturatesG: number;
  carbohydrateG: number;
  sugarsG: number;
  proteinG: number;
  saltG: number;
  // The one figure a label may legally omit (EU Reg 1169/2011 makes fibre
  // optional, FDA 21 CFR 101.9 mandatory). null is "not printed", never 0.
  fibreG: number | null;
}
