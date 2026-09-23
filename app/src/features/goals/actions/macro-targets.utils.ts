// Lives here, not in goals.ts: goals.ts is "use server", which may only
// export async functions.

import { MacroTargetsNeedGoalError } from "./goals.errors";

export const MACRO_KEYS = ["protein", "carbs", "fat"] as const;
export type MacroKey = (typeof MACRO_KEYS)[number];

// A share of the kcal goal, or grams. Shares need a kcal goal to mean anything;
// grams stand on their own.
export type MacroTargetUnit = "pct" | "g";

// null = that macro is not tracked.
export type MacroValues = Record<MacroKey, number | null>;

export interface MacroTargets {
  unit: MacroTargetUnit;
  values: MacroValues;
}

export type MacroTargetsDraft = Record<MacroKey, string>;

// Published: Atwater general factors, as EU Regulation 1169/2011 Annex XIV
// fixes them for label energy. The only bridge between a share of kcal and
// grams, in either direction.
export const KCAL_PER_GRAM: Record<MacroKey, number> = { protein: 4, carbs: 4, fat: 9 };

export const WHOLE_PCT = 100;

// Storage bound of the smallint columns, not a dietary one - same reasoning
// as GOAL_STORAGE_CEILING.
export const GRAM_TARGET_CEILING = 32_767;

export const EMPTY_TARGETS_DRAFT: MacroTargetsDraft = { protein: "", carbs: "", fat: "" };

const ceilingFor = (unit: MacroTargetUnit): number => (unit === "pct" ? WHOLE_PCT : GRAM_TARGET_CEILING);

const trackedValues = (values: MacroValues): number[] =>
  MACRO_KEYS.map((key) => values[key]).filter((value): value is number => value !== null);

const sum = (figures: number[]): number => figures.reduce((total, figure) => total + figure, 0);

// Every tracked share must fit in the whole, and three tracked shares must
// fill it: with all three named there is nothing left for the rest to be.
const pctFits = (values: MacroValues): boolean => {
  const tracked = trackedValues(values);
  return tracked.length === MACRO_KEYS.length ? sum(tracked) === WHOLE_PCT : sum(tracked) <= WHOLE_PCT;
};

const isWholeFigure = (unit: MacroTargetUnit) => (figure: number): boolean =>
  Number.isInteger(figure) && figure >= 0 && figure <= ceilingFor(unit);

// Mirrors the user_macro_targets_* CHECKs; the columns refuse what this refuses.
export const isValidMacroTargets = ({ unit, values }: MacroTargets): boolean => {
  const tracked = trackedValues(values);
  if (tracked.length === 0 || !tracked.every(isWholeFigure(unit))) return false;
  return unit === "g" || pctFits(values);
};

export const targetsToDraft = (targets: MacroTargets | null): MacroTargetsDraft =>
  targets === null
    ? EMPTY_TARGETS_DRAFT
    : {
        protein: targets.values.protein === null ? "" : String(targets.values.protein),
        carbs: targets.values.carbs === null ? "" : String(targets.values.carbs),
        fat: targets.values.fat === null ? "" : String(targets.values.fat),
      };

export type TargetsReading =
  | { kind: "empty" }
  | { kind: "unreadable" }
  | { kind: "off"; totalPct: number; targets: MacroTargets }
  | { kind: "ready"; targets: MacroTargets };

const readFigure = (text: string): number | null => (text.trim() === "" ? null : Number(text.trim()));

// A blank field is an untracked macro, never a zero: "protein 150, the rest
// blank" is the commonest target there is.
export const readTargetsDraft = (draft: MacroTargetsDraft, unit: MacroTargetUnit): TargetsReading => {
  const values: MacroValues = { protein: readFigure(draft.protein), carbs: readFigure(draft.carbs), fat: readFigure(draft.fat) };
  const tracked = trackedValues(values);

  if (tracked.length === 0) return { kind: "empty" };
  if (!tracked.every(isWholeFigure(unit))) return { kind: "unreadable" };

  const targets = { unit, values };
  if (unit === "pct" && !pctFits(values)) return { kind: "off", totalPct: sum(tracked), targets };
  return { kind: "ready", targets };
};

export const pctToGrams = (pct: number, calorieGoal: number, key: MacroKey): number =>
  Math.round((calorieGoal * pct) / WHOLE_PCT / KCAL_PER_GRAM[key]);

export const gramsToPct = (grams: number, calorieGoal: number, key: MacroKey): number =>
  Math.round(((grams * KCAL_PER_GRAM[key]) / calorieGoal) * WHOLE_PCT);

const CONVERTERS: Record<MacroTargetUnit, typeof pctToGrams> = { g: pctToGrams, pct: gramsToPct };

// Field by field, so a blank stays untracked and a half-typed entry stays as
// typed rather than vanishing when the kcal goal is switched off or on.
export const convertTargetsDraft = (
  draft: MacroTargetsDraft,
  calorieGoal: number,
  to: MacroTargetUnit,
): MacroTargetsDraft => {
  const convertField = (key: MacroKey): string => {
    const figure = readFigure(draft[key]);
    if (figure === null || !Number.isFinite(figure)) return draft[key];
    return String(CONVERTERS[to](figure, calorieGoal, key));
  };
  return { protein: convertField("protein"), carbs: convertField("carbs"), fat: convertField("fat") };
};

// Grams per tracked macro, whatever unit they were set in. A share with no
// kcal goal has no grams; the pct-needs-goal CHECK keeps that out of storage,
// so reaching it here is a bug upstream, not a state to draw.
export const gramTargets = ({ unit, values }: MacroTargets, calorieGoal: number | null): MacroValues => {
  if (unit === "g") return values;
  if (calorieGoal === null) throw new MacroTargetsNeedGoalError();

  const toGrams = (key: MacroKey): number | null =>
    values[key] === null ? null : pctToGrams(values[key], calorieGoal, key);
  return { protein: toGrams("protein"), carbs: toGrams("carbs"), fat: toGrams("fat") };
};

// PUBLISHED - Morton RW et al., Br J Sports Med 2018;52:376: lean-mass gains
// plateau near 1.6 g/kg/day, upper 95% CI 2.2. 1.8 sits inside that range, so
// a recomp starts there rather than at an edge of it.
export const RECOMP_PROTEIN_G_PER_KG = 1.8;

export const recompProteinGrams = (weightKg: number): number => Math.round(weightKg * RECOMP_PROTEIN_G_PER_KG);
