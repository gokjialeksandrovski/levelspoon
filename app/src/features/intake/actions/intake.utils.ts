// Lives here, not in intake.ts: intake.ts is "use server", which may only
// export async functions. Same split as weight.ts / weight.utils.ts. The form
// runs these same functions for its live range; the server runs them again on
// save and never trusts a figure from the browser.
//
// Every constant says whether it is PUBLISHED (with its source) or JUDGMENT
// (chosen here; no published figure). Tell the two apart before changing one.
import {
  isValidWeightKg,
  MAX_BAND_KG,
  MAX_RATE_KG_PER_WEEK,
  MIN_BAND_KG,
  MIN_RATE_KG_PER_WEEK,
} from "@/features/weight/actions/weight.utils";

import type { MeasuredBurn } from "./measured-burn.utils";

export type IntakeSex = "male" | "female" | "unspecified";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "very" | "extreme";
export type PrimaryGoal = "lose_fat" | "maintain" | "gain_muscle";
export type BodyFatSource = "typed" | "visual";
export type TrainingStyle = "sedentary" | "cardio" | "strength" | "mixed";
export type TrainingYears = "none" | "under_1" | "1_to_3" | "over_3";
/** What the user's weight did while they ate their reported intake. */
export type WeightTrend = "steady" | "down" | "up";

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
  /** Days the user wants their intake averaged over; 1 is a strict daily target. */
  trackingPeriodDays: number | null;
  pregnantOrBreastfeeding: boolean;
  metabolismCondition: boolean;
  /** Signed: + the condition raised metabolism, - lowered it. */
  metabolismAdjustPct: number | null;
  /** What the user says they eat a day now. Null when they don't know. */
  currentIntakeKcal: number | null;
  /** Set exactly when currentIntakeKcal is. */
  weightTrend: WeightTrend | null;
  /** How fast, for a down or up trend only. */
  weightTrendKgPerWeek: number | null;
}

/** Everything the estimate reads. Weight, goal weight, pace, band and recomp
 * belong to the weight feature's tables, not intake_profiles. */
export interface IntakeInput extends IntakeProfile {
  weightKg: number;
  goalWeightKg: number | null;
  /** A typed pace. Null asks for the suggested one. */
  paceKgPerWeek: number | null;
  /** Maintain only. Null saves no hold goal. */
  holdBandKg: number | null;
  /** Maintain only, and only with a band: it is stored on the hold goal. */
  recomp: boolean;
}

export type IntakeField =
  | "birth_year"
  | "height"
  | "weight"
  | "goal_weight"
  | "goal_direction"
  | "pace"
  | "band"
  | "recomp"
  | "body_fat"
  | "strength_days"
  | "tracking_period"
  | "metabolism"
  | "current_intake"
  | "weight_trend";

export type RefusalReason = "under_18" | "pregnancy";

/** The typed intake, and the maintenance it works out to. */
export interface ReportedIntake {
  intakeKcal: number;
  trend: WeightTrend;
  kgPerWeek: number | null;
  maintenanceKcal: number;
}

export interface IntakeReady {
  kind: "ready";
  bmrKcal: number;
  maintenanceKcal: number;
  /** True when maintenanceKcal came from the user's own logs, not the formula. */
  isMeasured: boolean;
  /** True when maintenanceKcal came from the intake the user typed. */
  isReported: boolean;
  /** Null when no intake was typed. Present but unused when a measured
   * figure won, or when it came out below BMR. */
  reported: ReportedIntake | null;
  /** BMR x activity, always computed, so Details can state both figures. */
  formulaMaintenanceKcal: number;
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
// 2: the helper names weight, body fat and intake, once intake was stored.
export const CONSENT_VERSION = 2;

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
export const KCAL_PER_KG = 7700;
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
// JUDGMENT - self-reported intake runs low by double-digit percentages against
// doubly labelled water (e.g. the OPEN study, Subar AF et al., Am J Epidemiol
// 2003;158:1). No published band fits a typed daily figure, so 15%; the BMR
// check in resolveMaintenance catches the worst under-reports outright.
const REPORTED_INTAKE_WIDTH_SHARE = 0.15;

// Which way a trend moves maintenance away from what is eaten: losing weight
// means burning more than you eat, so maintenance sits above the intake.
const TREND_DIRECTION: Record<WeightTrend, number> = { steady: 0, down: 1, up: -1 };

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
// Mirrors intake_tracking_period in the schema. A year, the same ceiling a
// weigh-in cadence has: any whole number of days, like that field.
export const MIN_TRACKING_PERIOD_DAYS = 1;
export const MAX_TRACKING_PERIOD_DAYS = 365;
// Typing guards, like MAX_AGE: no adult eats under 500 or over 10,000 a day as
// a habit, so a figure past either is a slipped keystroke. Mirrored by
// intake_current_intake in the schema.
const MIN_REPORTED_INTAKE_KCAL = 500;
const MAX_REPORTED_INTAKE_KCAL = 10000;

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

const GOAL_DIRECTION: Record<PrimaryGoal, number> = { lose_fat: -1, maintain: 0, gain_muscle: 1 };

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

// Maintain carries neither figure: a goal weight there has no direction to
// check, and a pace has nothing to move. It carries a band instead, and recomp
// rides on the hold goal that band saves, so recomp without one has no home.
const undirectedGoalError = (input: IntakeInput): IntakeField | null => {
  if (input.goalWeightKg !== null) return "goal_weight";
  if (input.paceKgPerWeek !== null) return "pace";
  if (input.holdBandKg === null) return input.recomp ? "recomp" : null;
  return inRange(input.holdBandKg, MIN_BAND_KG, MAX_BAND_KG) ? null : "band";
};

const goalError = (input: IntakeInput): IntakeField | null => {
  const direction = GOAL_DIRECTION[input.primaryGoal];
  if (direction === 0) return undirectedGoalError(input);
  if (input.holdBandKg !== null) return "band";
  if (input.recomp) return "recomp";
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

const trackingPeriodError = (input: IntakeInput): IntakeField | null => {
  const days = input.trackingPeriodDays;
  if (days === null) return null;
  return Number.isInteger(days) && inRange(days, MIN_TRACKING_PERIOD_DAYS, MAX_TRACKING_PERIOD_DAYS)
    ? null
    : "tracking_period";
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

const hasTrendRate = (trend: WeightTrend | null): boolean => trend !== null && trend !== "steady";

// A trend without an intake, or a rate without a moving trend, is a leftover
// nobody vouched for. The form clears both, so reaching one means a bad
// caller, not a user.
const trendError = (trend: WeightTrend | null, rate: number | null): IntakeField | null => {
  if (trend === null) return "weight_trend";
  if (!hasTrendRate(trend)) return rate === null ? null : "weight_trend";
  return rate !== null && inRange(rate, MIN_RATE_KG_PER_WEEK, MAX_RATE_KG_PER_WEEK) ? null : "weight_trend";
};

const reportedIntakeError = (input: IntakeInput): IntakeField | null => {
  const kcal = input.currentIntakeKcal;
  if (kcal === null) {
    return input.weightTrend === null && input.weightTrendKgPerWeek === null ? null : "current_intake";
  }
  if (!Number.isInteger(kcal) || !inRange(kcal, MIN_REPORTED_INTAKE_KCAL, MAX_REPORTED_INTAKE_KCAL)) {
    return "current_intake";
  }
  return trendError(input.weightTrend, input.weightTrendKgPerWeek);
};

// Returns the first offending field, or null when the input can be estimated
// and stored. Under 18 and pregnancy are not bad fields - they are refusals,
// which estimateIntake returns as data.
export const intakeInputError = (input: IntakeInput, currentYear: number): IntakeField | null =>
  bodyError(input, currentYear) ??
  goalError(input) ??
  bodyFatError(input) ??
  trainingError(input) ??
  trackingPeriodError(input) ??
  metabolismError(input) ??
  reportedIntakeError(input);

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

// What the typed intake says maintenance is: the intake itself when weight
// held, plus or minus the energy the trend stands for when it moved.
const reportedIntakeOf = (input: IntakeInput): ReportedIntake | null => {
  if (input.currentIntakeKcal === null || input.weightTrend === null) return null;
  const trendKcal = ((input.weightTrendKgPerWeek ?? 0) * KCAL_PER_KG) / DAYS_PER_WEEK;
  return {
    intakeKcal: input.currentIntakeKcal,
    trend: input.weightTrend,
    kgPerWeek: input.weightTrendKgPerWeek,
    maintenanceKcal: input.currentIntakeKcal + TREND_DIRECTION[input.weightTrend] * trendKcal,
  };
};

interface Maintenance {
  kcal: number;
  source: "measured" | "reported" | "formula";
  /** Half-width of the range when the figure brings its own; null uses the formula band. */
  widthKcal: number | null;
}

// Most direct evidence wins: the user's own logs, then what they say they eat,
// then the formula. A logged or reported figure below the user's own BMR is
// not something a body does - it is what under-logging or under-reporting
// looks like - so it is refused and the next source stands (spec §5). The
// deficit floor cannot catch it: the floor is clamped to maintenance, so it
// would follow the bad figure down and then print it as the floor.
const resolveMaintenance = (
  formulaKcal: number,
  bmr: number,
  measured: MeasuredBurn | null,
  reported: number | null,
): Maintenance => {
  if (measured?.kind === "measured" && measured.kcal >= bmr) {
    return { kcal: measured.kcal, source: "measured", widthKcal: measured.sigma };
  }
  if (reported !== null && reported >= bmr) {
    return { kcal: reported, source: "reported", widthKcal: reported * REPORTED_INTAKE_WIDTH_SHARE };
  }
  return { kcal: formulaKcal, source: "formula", widthKcal: null };
};

const weeksToGoal = (input: IntakeInput, pace: number | null, isMaintenanceOnly: boolean): number | null => {
  if (input.goalWeightKg === null || pace === null || isMaintenanceOnly) return null;
  return Math.abs(input.weightKg - input.goalWeightKg) / pace;
};

const readyEstimate = (input: IntakeInput, age: number, measured: MeasuredBurn | null): IntakeReady => {
  // BMR is still computed when a measured or reported figure wins: the §7
  // floor reads it, and the metabolism factor inside it keeps that floor from
  // sitting above a down-regulated maintenance. What those paths drop is the
  // activity product and the Mifflin width band - a burn the user lived
  // already contains whatever their activity and condition do to it, so
  // applying either correction on top would count it twice.
  const bmr = bmrKcal(input, age);
  const formulaMaintenance = bmr * ACTIVITY_FACTOR[input.activityLevel];
  const reported = reportedIntakeOf(input);
  const resolved = resolveMaintenance(formulaMaintenance, bmr, measured, reported?.maintenanceKcal ?? null);
  const maintenance = resolved.kcal;
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
  const width = resolved.widthKcal ?? rangeWidthKcal(input, point);
  const lean = leanMassKg(input);

  return {
    kind: "ready",
    bmrKcal: bmr,
    maintenanceKcal: maintenance,
    isMeasured: resolved.source === "measured",
    isReported: resolved.source === "reported",
    reported,
    formulaMaintenanceKcal: formulaMaintenance,
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

// Assumes intakeInputError(input, currentYear) returned null. `measured`
// defaults to null for a caller whose measured burn is still in flight.
export const estimateIntake = (
  input: IntakeInput,
  currentYear: number,
  measured: MeasuredBurn | null = null,
): IntakeEstimate => {
  const age = ageIn(input.birthYear, currentYear);
  const refused = refusal(input, age);
  return refused ? { kind: "refused", reason: refused } : readyEstimate(input, age, measured);
};
