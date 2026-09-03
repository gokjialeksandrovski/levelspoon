import { resolveGrams, type MeasureContext } from "./resolve-grams";

// FDA net-weight declarations bracket a metric conversion after the primary
// oz/lb figure - "NET WT 1.86 OZ (52.7g)" - and a real capture showed
// PaddleOCR misreading "OZ" as "0Z" (a zero, not the letter O), which
// silently breaks parseMeasure's usual unit matching. The bracketed figure
// is unaffected by that specific corruption, so it's tried first;
// resolveGrams's ordinary parsing is still the fallback for a weight with
// no bracketed conversion at all.
const BRACKETED_GRAMS = /\((\d+(?:[.,]\d+)?)\s*g\)/i;

/**
 * Grams for a package's printed net weight, most-reliable source first.
 *
 * Reuses resolveGrams for the fallback rather than duplicating its unit
 * table, so a liquid product's net volume still resolves through the same
 * density-aware path a serving size does.
 */
export const resolveNetWeightGrams = (text: string, context: MeasureContext): number | null => {
  const bracketed = BRACKETED_GRAMS.exec(text);
  if (bracketed) {
    return Number(bracketed[1].replace(",", "."));
  }
  const resolution = resolveGrams(text, context);
  return resolution.kind === "grams" ? resolution.grams : null;
};
