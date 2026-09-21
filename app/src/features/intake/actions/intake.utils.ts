// Lives here, not in intake.ts: intake.ts is "use server", which may only
// export async functions. Same split as weight.ts / weight.utils.ts. The form
// runs these same functions for its live range; the server runs them again on
// save and never trusts a figure from the browser.
//
// Every constant says whether it is PUBLISHED (with its source) or JUDGMENT
// (chosen here; no published figure). Tell the two apart before changing one.
import {
  isValidWeightKg,
  MAX_RATE_KG_PER_WEEK,
  MIN_RATE_KG_PER_WEEK,
} from "@/features/weight/actions/weight.utils";

export type IntakeSex = "male" | "female" | "unspecified";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "very" | "extreme";
export type PrimaryGoal = "lose_fat" | "maintain" | "gain_muscle" | "recomp";
export type BodyFatSource = "typed" | "visual";
export type TrainingStyle = "sedentary" | "cardio" | "strength" | "mixed";
export type TrainingYears = "none" | "under_1" | "1_to_3" | "over_3";
export type TrackingStyle = "daily" | "weekly_average";

export const BODY_FAT_STAGES = ["abs", "flat", "soft", "belly", "large"] as const;
export type BodyFatStage = (typeof BODY_FAT_STAGES)[number];

/** The answers intake_profiles stores. */
export interface IntakeProfile {
  sex: IntakeSex;
  birthYear: number;
  heightCm: number;
  activityLevel: ActivityLevel;
  primaryGoal: PrimaryGoal;
  bodyFatPct: number | null;
  bodyFatSource: BodyFatSource | null;
  trainingStyle: TrainingStyle | null;
  strengthDaysPerWeek: number | null;
  trainingYears: TrainingYears | null;
  trackingStyle: TrackingStyle | null;
  pregnantOrBreastfeeding: boolean;
  metabolismCondition: boolean;
  /** Signed: + the condition raised metabolism, - lowered it. */
  metabolismAdjustPct: number | null;
}

/** Everything the estimate reads. Weight, goal weight and pace belong to the
 * weight feature's tables, not intake_profiles. */
export interface IntakeInput extends IntakeProfile {
  weightKg: number;
  goalWeightKg: number | null;
  /** A typed pace. Null asks for the suggested one. */
  paceKgPerWeek: number | null;
}

export type IntakeField =
  | "birth_year"
  | "height"
  | "weight"
  | "goal_weight"
  | "goal_direction"
  | "pace"
  | "body_fat"
  | "strength_days"
  | "metabolism";

export type RefusalReason = "under_18" | "pregnancy";

export interface IntakeReady {
  kind: "ready";
  bmrKcal: number;
  maintenanceKcal: number;
  /** Before the floor: what the pace asks for, so the details line states the
   * user's own arithmetic even when the floor overrides it. */
  adjustmentKcal: number;
  pointKcal: number;
  lowKcal: number;
  highKcal: number;
  floorKcal: number;
  isFloored: boolean;
  isMaintenanceOnly: boolean;
  paceKgPerWeek: number | null;
  isPaceSuggested: boolean;
  isPaceOverCap: boolean;
  paceCapSharePerWeek: number | null;
  bmi: number;
  leanMassKg: number | null;
  ffmi: number | null;
  weeksToGoal: number | null;
}

export type IntakeEstimate = { kind: "refused"; reason: RefusalReason } | IntakeReady;

// Bump when the consent copy in intake-form.tsx changes, so a stored consent
// can be traced to the wording it was given against (spec §13).
export const CONSENT_VERSION = 1;

// PUBLISHED - Mifflin MD, St Jeor ST et al., Am J Clin Nutr 1990;51:241-7.
// BMR kcal/day = 10·kg + 6.25·cm − 5·age + s.
const MIFFLIN_PER_KG = 10;
const MIFFLIN_PER_CM = 6.25;
const MIFFLIN_PER_YEAR = 5;
// Unspecified is the midpoint of the two published constants - derived, not
// published, and the range widens by half their gap to carry it.
const MIFFLIN_SEX_OFFSET: Record<IntakeSex, number> = { male: 5, female: -161, unspecified: -78 };

// PUBLISHED - Katch-McArdle: BMR = 370 + 21.6 · lean mass kg. Needs neither
// sex nor age, which is why a known body fat switches to it.
const KATCH_BASE_KCAL = 370;
const KATCH_PER_LEAN_KG = 21.6;

// PUBLISHED - the standard activity factors (McArdle, Katch & Katch, Exercise
// Physiology), as used with Harris-Benedict and Mifflin alike.
const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
  extreme: 1.9,
};

// PUBLISHED - Wishnofsky 1958's 3500 kcal/lb, in kg. Overstates long-run loss
// (Hall KD, Int J Obes 2008;32:573), which the timeline copy says out loud.
const KCAL_PER_KG = 7700;
const DAYS_PER_WEEK = 7;
const MONTHS_PER_YEAR = 12;
const WEEKS_PER_YEAR = 52;

// PUBLISHED - Helms ER et al., JISSN 2014;11:20: 0.5-1% of body weight per
// week preserves lean mass during a deficit. Suggest the bottom, cap the top.
const LOSS_SUGGESTED_SHARE_PER_WEEK = 0.005;
const LOSS_CAP_SHARE_PER_WEEK = 0.01;

// PUBLISHED - Aragon's monthly gain targets by training age, as given in Helms,
// Morgan & Valdez, The Muscle and Strength Pyramid: Nutrition (2nd ed.).
// "Unknown" takes the intermediate figure.
const GAIN_SHARE_PER_MONTH: Record<TrainingYears | "unknown", number> = {
  none: 0.015,
  under_1: 0.015,
  "1_to_3": 0.01,
  over_3: 0.005,
  unknown: 0.01,
};
// JUDGMENT - past the novice rate by a margin; anything faster is mostly fat.
const GAIN_CAP_SHARE_PER_WEEK = 0.005;

// PUBLISHED - the common clinical minimums for an unsupervised diet (NIH/NHLBI
// guidance: 1200 women, 1500 men). Unspecified takes the higher, safer one.
const KCAL_FLOOR: Record<IntakeSex, number> = { male: 1500, female: 1200, unspecified: 1500 };

// PUBLISHED - WHO adult BMI cut-off for underweight.
const UNDERWEIGHT_BMI = 18.5;
// The formulas are validated on adults; below this age there is no estimate.
const ADULT_AGE = 18;

// PUBLISHED - Frankenfield D et al., J Am Diet Assoc 2005;105:775: Mifflin
// predicts within 10% of measured RMR for most non-obese adults.
const BASE_WIDTH_SHARE = 0.1;
// JUDGMENT - a typed body fat and Katch-McArdle narrow the band a little.
const TYPED_BODY_FAT_WIDTH_SHARE = 0.08;
// JUDGMENT - a condition with no figure is the widest honest range we give.
const METABOLISM_UNKNOWN_WIDTH_SHARE = 0.1;
// JUDGMENT - a user's own figure is itself an estimate.
const METABOLISM_TYPED_WIDTH_SHARE = 0.05;
// Derived - half the male/female Mifflin gap (166 kcal).
const UNSPECIFIED_SEX_WIDTH_KCAL = (MIFFLIN_SEX_OFFSET.male - MIFFLIN_SEX_OFFSET.female) / 2;

// Storage-and-typing guards, not medical opinion - the same stance as
// MIN_CALORIE_GOAL. A value past them is a slipped keystroke.
const MAX_AGE = 100;
const MIN_HEIGHT_CM = 100;
const MAX_HEIGHT_CM = 250;
const MIN_BODY_FAT_PCT = 3;
const MAX_BODY_FAT_PCT = 60;
const MIN_METABOLISM_ADJUST_PCT = 1;
export const MAX_METABOLISM_ADJUST_PCT = 30;
const MAX_STRENGTH_DAYS = 7;

// JUDGMENT - visual body-fat charts are approximations; §6.5 keeps the range
// wide for a stage rather than narrowing it.
const STAGE_PCT: Record<BodyFatStage, { male: number; female: number }> = {
  abs: { male: 10, female: 18 },
  flat: { male: 15, female: 23 },
  soft: { male: 20, female: 28 },
  belly: { male: 27, female: 35 },
  large: { male: 35, female: 42 },
};

const PERCENT = 100;
const CM_PER_M = 100;
const KCAL_ROUNDING = 10;
const YEAR_DIGITS = 4;

const GOAL_DIRECTION: Record<PrimaryGoal, number> = { lose_fat: -1, maintain: 0, gain_muscle: 1, recomp: 0 };

export const roundKcal = (kcal: number): number => Math.round(kcal / KCAL_ROUNDING) * KCAL_ROUNDING;

export const yearOf = (localDate: string): number => Number(localDate.slice(0, YEAR_DIGITS));

export const stageBodyFatPct = (stage: BodyFatStage, sex: IntakeSex): number => {
  const { male, female } = STAGE_PCT[stage];
  if (sex === "unspecified") return (male + female) / 2;
  return sex === "male" ? male : female;
};

export const stageForBodyFat = (pct: number, sex: IntakeSex): BodyFatStage | null =>
  BODY_FAT_STAGES.find((stage) => stageBodyFatPct(stage, sex) === pct) ?? null;

const inRange = (value: number, min: number, max: number): boolean =>
  Number.isFinite(value) && value >= min && value <= max;

const ageIn = (birthYear: number, currentYear: number): number => currentYear - birthYear;

const bodyError = (input: IntakeInput, currentYear: number): IntakeField | null => {
  if (!Number.isInteger(input.birthYear) || !inRange(ageIn(input.birthYear, currentYear), 0, MAX_AGE)) {
    return "birth_year";
  }
  if (!inRange(input.heightCm, MIN_HEIGHT_CM, MAX_HEIGHT_CM)) return "height";
  return isValidWeightKg(input.weightKg) ? null : "weight";
};

// Maintain and recomp carry neither figure: a goal weight there has no
// direction to check, and a pace has nothing to move.
const undirectedGoalError = (input: IntakeInput): IntakeField | null => {
  if (input.goalWeightKg !== null) return "goal_weight";
  return input.paceKgPerWeek === null ? null : "pace";
};

const goalError = (input: IntakeInput): IntakeField | null => {
  const direction = GOAL_DIRECTION[input.primaryGoal];
  if (direction === 0) return undirectedGoalError(input);
  if (input.paceKgPerWeek !== null && !inRange(input.paceKgPerWeek, MIN_RATE_KG_PER_WEEK, MAX_RATE_KG_PER_WEEK)) {
    return "pace";
  }
  if (input.goalWeightKg === null) return null;
  if (!isValidWeightKg(input.goalWeightKg)) return "goal_weight";
  // A mismatch is refused, never flipped: the user said which way they want
  // to go, and the number disagreeing is the thing to show them.
  return Math.sign(input.goalWeightKg - input.weightKg) === direction ? null : "goal_direction";
};

const bodyFatError = (input: IntakeInput): IntakeField | null => {
  if ((input.bodyFatPct === null) !== (input.bodyFatSource === null)) return "body_fat";
  if (input.bodyFatPct === null) return null;
  return inRange(input.bodyFatPct, MIN_BODY_FAT_PCT, MAX_BODY_FAT_PCT) ? null : "body_fat";
};

const trainingError = (input: IntakeInput): IntakeField | null => {
  const days = input.strengthDaysPerWeek;
  if (days === null) return null;
  return Number.isInteger(days) && inRange(days, 0, MAX_STRENGTH_DAYS) ? null : "strength_days";
};

const metabolismError = (input: IntakeInput): IntakeField | null => {
  const pct = input.metabolismAdjustPct;
  if (pct === null) return null;
  const isStorable =
    input.metabolismCondition &&
    Number.isInteger(pct) &&
    inRange(Math.abs(pct), MIN_METABOLISM_ADJUST_PCT, MAX_METABOLISM_ADJUST_PCT);
  return isStorable ? null : "metabolism";
};

// Returns the first offending field, or null when the input can be estimated
// and stored. Under 18 and pregnancy are not bad fields - they are refusals,
// which estimateIntake returns as data.
export const intakeInputError = (input: IntakeInput, currentYear: number): IntakeField | null =>
  bodyError(input, currentYear) ??
  goalError(input) ??
  bodyFatError(input) ??
  trainingError(input) ??
  metabolismError(input);

const leanMassKg = (input: IntakeInput): number | null =>
  input.bodyFatPct === null ? null : input.weightKg * (1 - input.bodyFatPct / PERCENT);

// Scales BMR, not maintenance: the §7 floor reads BMR, and an unscaled one
// would put the floor above a down-regulated maintenance.
const metabolismFactor = (input: IntakeInput): number => 1 + (input.metabolismAdjustPct ?? 0) / PERCENT;

const bmrKcal = (input: IntakeInput, age: number): number => {
  const lean = leanMassKg(input);
  const formula =
    lean === null
      ? MIFFLIN_PER_KG * input.weightKg +
        MIFFLIN_PER_CM * input.heightCm -
        MIFFLIN_PER_YEAR * age +
        MIFFLIN_SEX_OFFSET[input.sex]
      : KATCH_BASE_KCAL + KATCH_PER_LEAN_KG * lean;
  return formula * metabolismFactor(input);
};

const heightSquaredM = (heightCm: number): number => (heightCm / CM_PER_M) ** 2;

const suggestedPace = (input: IntakeInput): number => {
  if (input.primaryGoal === "lose_fat") return input.weightKg * LOSS_SUGGESTED_SHARE_PER_WEEK;
  const monthlyShare = GAIN_SHARE_PER_MONTH[input.trainingYears ?? "unknown"];
  return (input.weightKg * monthlyShare * MONTHS_PER_YEAR) / WEEKS_PER_YEAR;
};

interface Pace {
  kgPerWeek: number | null;
  isSuggested: boolean;
  isOverCap: boolean;
  capShare: number | null;
}

const NO_PACE: Pace = { kgPerWeek: null, isSuggested: false, isOverCap: false, capShare: null };

// A typed pace past the cap is stated, never refused - every figure the user
// picks stays typeable, as on the weight goal. The kcal floor still holds.
const resolvePace = (input: IntakeInput): Pace => {
  if (GOAL_DIRECTION[input.primaryGoal] === 0) return NO_PACE;
  const capShare = input.primaryGoal === "lose_fat" ? LOSS_CAP_SHARE_PER_WEEK : GAIN_CAP_SHARE_PER_WEEK;
  if (input.paceKgPerWeek === null) {
    return { kgPerWeek: suggestedPace(input), isSuggested: true, isOverCap: false, capShare };
  }
  return {
    kgPerWeek: input.paceKgPerWeek,
    isSuggested: false,
    isOverCap: input.paceKgPerWeek > input.weightKg * capShare,
    capShare,
  };
};

const metabolismWidthShare = (input: IntakeInput): number => {
  if (!input.metabolismCondition) return 0;
  return input.metabolismAdjustPct === null ? METABOLISM_UNKNOWN_WIDTH_SHARE : METABOLISM_TYPED_WIDTH_SHARE;
};

// Katch-McArdle has no sex term, so only the Mifflin path pays for a sex that
// was not given.
const sexWidthKcal = (input: IntakeInput): number =>
  input.sex === "unspecified" && input.bodyFatPct === null ? UNSPECIFIED_SEX_WIDTH_KCAL : 0;

const rangeWidthKcal = (input: IntakeInput, pointKcal: number): number => {
  const formulaShare = input.bodyFatSource === "typed" ? TYPED_BODY_FAT_WIDTH_SHARE : BASE_WIDTH_SHARE;
  return pointKcal * (formulaShare + metabolismWidthShare(input)) + sexWidthKcal(input);
};

const weeksToGoal = (input: IntakeInput, pace: number | null, isMaintenanceOnly: boolean): number | null => {
  if (input.goalWeightKg === null || pace === null || isMaintenanceOnly) return null;
  return Math.abs(input.weightKg - input.goalWeightKg) / pace;
};

const readyEstimate = (input: IntakeInput, age: number): IntakeReady => {
  const bmr = bmrKcal(input, age);
  const maintenance = bmr * ACTIVITY_FACTOR[input.activityLevel];
  const bmi = input.weightKg / heightSquaredM(input.heightCm);
  const isMaintenanceOnly = input.primaryGoal === "lose_fat" && bmi < UNDERWEIGHT_BMI;
  const pace = resolvePace(input);
  const adjustment =
    isMaintenanceOnly || pace.kgPerWeek === null
      ? 0
      : (GOAL_DIRECTION[input.primaryGoal] * pace.kgPerWeek * KCAL_PER_KG) / DAYS_PER_WEEK;
  // Never above maintenance: the floor stops a deficit, it does not tell a
  // small, sedentary person to eat more than they burn.
  const floor = Math.min(maintenance, Math.max(bmr, KCAL_FLOOR[input.sex]));
  const raw = maintenance + adjustment;
  const point = Math.max(raw, floor);
  const width = rangeWidthKcal(input, point);
  const lean = leanMassKg(input);

  return {
    kind: "ready",
    bmrKcal: bmr,
    maintenanceKcal: maintenance,
    adjustmentKcal: adjustment,
    pointKcal: point,
    lowKcal: Math.max(floor, point - width),
    highKcal: point + width,
    floorKcal: floor,
    isFloored: raw < floor,
    isMaintenanceOnly,
    paceKgPerWeek: pace.kgPerWeek,
    isPaceSuggested: pace.isSuggested,
    isPaceOverCap: pace.isOverCap,
    paceCapSharePerWeek: pace.capShare,
    bmi,
    leanMassKg: lean,
    ffmi: lean === null ? null : lean / heightSquaredM(input.heightCm),
    weeksToGoal: weeksToGoal(input, pace.kgPerWeek, isMaintenanceOnly),
  };
};

const refusal = (input: IntakeInput, age: number): RefusalReason | null => {
  if (age < ADULT_AGE) return "under_18";
  return input.pregnantOrBreastfeeding ? "pregnancy" : null;
};

// Assumes intakeInputError(input, currentYear) returned null.
export const estimateIntake = (input: IntakeInput, currentYear: number): IntakeEstimate => {
  const age = ageIn(input.birthYear, currentYear);
  const refused = refusal(input, age);
  return refused ? { kind: "refused", reason: refused } : readyEstimate(input, age);
};
