// app/src/features/weight/actions/weight.utils.ts
// Lives here, not in weight.ts: weight.ts is "use server", which may only
// export async functions. Same split as goals.ts / goals.utils.ts.
import { addCalendarDays, dayBoundsInTimezone } from "@/lib/date/day-bounds";

// Storage-and-typing guards, not medical opinion - the same stance as
// MIN_CALORIE_GOAL. A plausible adult reading needs nothing outside this
// range, so a value past it is a slipped keystroke.
export const MIN_WEIGHT_KG = 30;
export const MAX_WEIGHT_KG = 300;

// The numeric(4,2) columns' own ceiling, not an opinion about pace or band.
// A rate in kg/week is the user's wish; the app has no view on which wish is
// sensible, so the only floor is "a figure that means something" - a pace of
// zero projects a date that never arrives.
const COLUMN_CEILING = 99.99;
const SMALLEST_STORABLE = 0.01;
export const MIN_RATE_KG_PER_WEEK = SMALLEST_STORABLE;
export const MAX_RATE_KG_PER_WEEK = COLUMN_CEILING;
export const MIN_BAND_KG = SMALLEST_STORABLE;
export const MAX_BAND_KG = COLUMN_CEILING;

// A cadence is any whole number of days. Daily is offered: a daily reading is
// mostly water, which the app states rather than smooths, and the floor that
// used to sit at one week was the app deciding for the user.
export const MIN_CHECKIN_INTERVAL_DAYS = 1;
// Past a year the "in 400 days" countdown is a typo's output, not a schedule.
export const MAX_CHECKIN_INTERVAL_DAYS = 365;

export type WeightUnit = "kg" | "lb";

// International avoirdupois pound, exact by definition since 1959.
const KG_PER_LB = 0.45359237;

export const toKg = (value: number, unit: WeightUnit): number =>
  unit === "lb" ? value * KG_PER_LB : value;

export const fromKg = (weightKg: number, unit: WeightUnit): number =>
  unit === "lb" ? weightKg / KG_PER_LB : weightKg;

// Presets, built from one step each so the pound row is round numbers a
// person would say (0.5 / 1 / 1.5 / 2 lb per week) rather than the kilogram
// row converted into 0.55 / 1.1 / 1.65 / 2.2. Only a figure the user typed
// themselves is ever converted.
const PRESET_COUNT = 4;
const PACE_PRESET_STEP: Record<WeightUnit, number> = { kg: 0.25, lb: 0.5 };
const BAND_PRESET_STEP: Record<WeightUnit, number> = { kg: 0.5, lb: 1 };
// The second chip in each row: 0.5 kg/wk or 1 lb/wk, ±1 kg or ±2 lb.
const DEFAULT_PRESET_STEPS = 2;

const presetsFrom = (step: number): number[] =>
  Array.from({ length: PRESET_COUNT }, (_, index) => roundToHundredth(step * (index + 1)));

export const pacePresets = (unit: WeightUnit): number[] => presetsFrom(PACE_PRESET_STEP[unit]);
export const bandPresets = (unit: WeightUnit): number[] => presetsFrom(BAND_PRESET_STEP[unit]);

export const defaultPace = (unit: WeightUnit): number =>
  roundToHundredth(PACE_PRESET_STEP[unit] * DEFAULT_PRESET_STEPS);
export const defaultBand = (unit: WeightUnit): number =>
  roundToHundredth(BAND_PRESET_STEP[unit] * DEFAULT_PRESET_STEPS);

const DAILY_DAYS = 1;
const WEEKLY_DAYS = 7;
const FORTNIGHTLY_DAYS = 14;
const MONTHLY_DAYS = 30;
// The four cadences people name. Everything between them is typeable.
export const CHECKIN_PRESETS = [DAILY_DAYS, WEEKLY_DAYS, FORTNIGHTLY_DAYS, MONTHLY_DAYS] as const;
export const DEFAULT_CHECKIN_INTERVAL_DAYS = WEEKLY_DAYS;

const CADENCE_LABELS: Record<number, string> = {
  [DAILY_DAYS]: "Daily",
  [WEEKLY_DAYS]: "Weekly",
  [FORTNIGHTLY_DAYS]: "2 weeks",
  [MONTHLY_DAYS]: "Monthly",
};

// Names a preset chip. Only the presets are ever passed, so every call finds
// its label; the fallback states the figure rather than guessing a name.
export const cadenceLabel = (days: number): string => CADENCE_LABELS[days] ?? `${days} days`;

// Flipping the unit re-expresses a typed figure, but a figure still sitting on
// a preset moves to the same position in the new unit's own round numbers, so
// 0.5 kg/wk becomes 1 lb/wk and not 1.1. Null when it is not on a preset.
export const convertedPreset = (
  text: string,
  presets: (unit: WeightUnit) => number[],
  from: WeightUnit,
  to: WeightUnit,
): string | null => {
  const index = presets(from).indexOf(parseDecimalDraft(text));
  return index === -1 ? null : String(presets(to)[index]);
};

const TENTHS_PER_UNIT = 10;
const HUNDREDTHS_PER_UNIT = 100;
const DAYS_PER_WEEK = 7;
const HOURS_PER_DAY = 24;
const MS_PER_HOUR = 3_600_000;

export type WeightGoalMode = "target" | "hold";

export interface WeightGoal {
  mode: WeightGoalMode;
  startWeightKg: number;
  startDate: string;
  targetWeightKg: number | null;
  rateKgPerWeek: number | null;
  holdBandKg: number | null;
  /** Hold mode only: the weight stays put while fat goes and muscle comes. */
  recomp: boolean;
  checkinIntervalDays: number;
}

export interface WeightEntry {
  measuredOn: string;
  weightKg: number;
}

export interface WeightView {
  goal: WeightGoal;
  /** Display unit only. Every figure in this view is kg. */
  unit: WeightUnit;
  latest: WeightEntry | null;
  /** The reading before `latest`, for the panel's "last change" line only. */
  previous: WeightEntry | null;
  nextCheckinDate: string;
}

export interface WeightGoalInput {
  mode: WeightGoalMode;
  unit: WeightUnit;
  currentWeightKg: number;
  targetWeightKg: number | null;
  rateKgPerWeek: number | null;
  holdBandKg: number | null;
  recomp: boolean;
  checkinIntervalDays: number;
}

export type InvalidGoalReason =
  | "weight"
  | "target"
  | "rate"
  | "band"
  | "recomp"
  | "cadence"
  | "target_equals_current";

// railShare positions the marker, fillShare the travelled part of the rail.
// Both 0-1 and both clamped: a reading past the target pins at the end, and
// the text beside the rail states the real figure.
interface RailPosition {
  railShare: number;
  fillShare: number;
}

export type WeightProgress =
  | ({ kind: "no-entries" } & RailPosition)
  | ({ kind: "losing" | "gaining"; currentKg: number; remainingKg: number } & RailPosition)
  | ({ kind: "reached"; currentKg: number } & RailPosition)
  | ({ kind: "holding"; currentKg: number; centerKg: number; bandKg: number; outsideByKg: number } & RailPosition);

export type CheckinCountdown =
  | { kind: "due" }
  | { kind: "days"; days: number }
  | { kind: "hours"; hours: number }
  | { kind: "imminent" };

export const roundToTenth = (value: number): number =>
  Math.round(value * TENTHS_PER_UNIT) / TENTHS_PER_UNIT;

export const roundToHundredth = (value: number): number =>
  Math.round(value * HUNDREDTHS_PER_UNIT) / HUNDREDTHS_PER_UNIT;

/** One decimal in whichever unit is on screen - what a scale reads to. */
export const displayWeight = (weightKg: number, unit: WeightUnit): number =>
  roundToTenth(fromKg(weightKg, unit));

const clampShare = (share: number): number => Math.min(1, Math.max(0, share));

export const isValidWeightKg = (weightKg: number): boolean =>
  Number.isFinite(weightKg) && weightKg >= MIN_WEIGHT_KG && weightKg <= MAX_WEIGHT_KG;

// A comma is the decimal separator on the keyboards this app is used on, and
// the nutrition parser already treats it as one.
export const parseDecimalDraft = (draft: string): number => {
  const trimmed = draft.trim();
  return trimmed === "" ? Number.NaN : Number(trimmed.replace(",", "."));
};

// Rounds in the unit the user typed, then stores kg at the column's
// precision: rounding the kilogram value instead would move a pound reading
// to a pound it was not.
export const draftToKg = (draft: string, unit: WeightUnit): number =>
  roundToHundredth(toKg(roundToTenth(parseDecimalDraft(draft)), unit));

export const isUnusableWeightDraft = (draft: string, unit: WeightUnit): boolean =>
  !isValidWeightKg(draftToKg(draft, unit));

// Runs on blur, never per keystroke: rounding mid-typing rewrites "7" into a
// value the next digit lands after, so the reading is never typeable.
export const commitWeightDraft = (draft: string, unit: WeightUnit, currentKg: number): number =>
  isUnusableWeightDraft(draft, unit) ? currentKg : draftToKg(draft, unit);

// A rate or a band is a distance, not a point on the scale, so it converts
// on the same factor with no offset - but it has its own range.
export const draftToRangedKg = (draft: string, unit: WeightUnit): number =>
  roundToHundredth(toKg(parseDecimalDraft(draft), unit));

const inRange = (value: number, min: number, max: number): boolean =>
  Number.isFinite(value) && value >= min && value <= max;

// Whole days only: half a day is not a cadence the calendar arithmetic can
// carry, and addCalendarDays would silently floor it.
export const isValidCheckinInterval = (days: number): boolean =>
  Number.isInteger(days) && inRange(days, MIN_CHECKIN_INTERVAL_DAYS, MAX_CHECKIN_INTERVAL_DAYS);

const targetGoalError = (input: WeightGoalInput): InvalidGoalReason | null => {
  if (input.targetWeightKg === null || !isValidWeightKg(input.targetWeightKg)) return "target";
  if (input.rateKgPerWeek === null || !inRange(input.rateKgPerWeek, MIN_RATE_KG_PER_WEEK, MAX_RATE_KG_PER_WEEK)) {
    return "rate";
  }
  if (input.holdBandKg !== null) return "band";
  // Recomp is holding a weight on purpose; a target is moving it.
  if (input.recomp) return "recomp";
  // A target equal to the current weight is a hold, and stored as a target it
  // draws a zero-length rail - the DB's own CHECK refuses it too.
  if (roundToTenth(input.targetWeightKg) === roundToTenth(input.currentWeightKg)) return "target_equals_current";
  return null;
};

const holdGoalError = (input: WeightGoalInput): InvalidGoalReason | null => {
  if (input.holdBandKg === null || !inRange(input.holdBandKg, MIN_BAND_KG, MAX_BAND_KG)) return "band";
  if (input.targetWeightKg !== null) return "target";
  if (input.rateKgPerWeek !== null) return "rate";
  return null;
};

// Returns the offending field, or null when the input is storable. Null means
// "no reason to reject", not a swallowed failure.
export const weightGoalInputError = (input: WeightGoalInput): InvalidGoalReason | null => {
  if (!isValidWeightKg(input.currentWeightKg)) return "weight";
  if (!isValidCheckinInterval(input.checkinIntervalDays)) return "cadence";
  return input.mode === "target" ? targetGoalError(input) : holdGoalError(input);
};

const holdProgress = (goal: WeightGoal, currentKg: number): WeightProgress => {
  const centerKg = goal.startWeightKg;
  const bandKg = goal.holdBandKg ?? 0;
  const low = centerKg - bandKg;
  const high = centerKg + bandKg;
  const outsideKg = currentKg > high ? currentKg - high : Math.min(0, currentKg - low);
  return {
    kind: "holding",
    currentKg,
    centerKg,
    bandKg,
    outsideByKg: outsideKg,
    railShare: clampShare((currentKg - low) / (high - low)),
    fillShare: 0,
  };
};

const targetProgress = (goal: WeightGoal, currentKg: number): WeightProgress => {
  const targetKg = goal.targetWeightKg ?? goal.startWeightKg;
  const span = targetKg - goal.startWeightKg;
  const travelled = currentKg - goal.startWeightKg;
  const share = clampShare(travelled / span);
  const position: RailPosition = { railShare: share, fillShare: share };
  const hasReached = span > 0 ? currentKg >= targetKg : currentKg <= targetKg;
  if (hasReached) {
    return { kind: "reached", currentKg, ...position };
  }
  return {
    kind: span > 0 ? "gaining" : "losing",
    currentKg,
    remainingKg: Math.abs(targetKg - currentKg),
    ...position,
  };
};

export const weightProgress = (goal: WeightGoal, latest: WeightEntry | null): WeightProgress => {
  if (latest === null) {
    return { kind: "no-entries", railShare: 0, fillShare: 0 };
  }
  return goal.mode === "hold" ? holdProgress(goal, latest.weightKg) : targetProgress(goal, latest.weightKg);
};

// Counted from the last reading, so logging early moves the next one along
// rather than leaving the cadence stuck to the goal's creation date.
export const nextCheckinDate = (goal: WeightGoal, latest: WeightEntry | null): string =>
  addCalendarDays(latest?.measuredOn ?? goal.startDate, goal.checkinIntervalDays);

export const isCheckinDue = (nextDate: string, today: string): boolean => today >= nextDate;

// Due at local midnight starting the due date, so the countdown runs out as
// the day the reading is asked for begins. Computed on render - a weekly
// cadence does not earn a ticking timer on the home page.
export const checkinCountdown = (nextDate: string, now: Date, timezone: string): CheckinCountdown => {
  const msLeft = dayBoundsInTimezone(nextDate, timezone).start.getTime() - now.getTime();
  if (msLeft <= 0) return { kind: "due" };
  const hoursLeft = msLeft / MS_PER_HOUR;
  if (hoursLeft < 1) return { kind: "imminent" };
  // 24h, not 48h: "in 45 hours" is arithmetic the reader has to finish.
  if (hoursLeft < HOURS_PER_DAY) return { kind: "hours", hours: Math.floor(hoursLeft) };
  return { kind: "days", days: Math.max(1, Math.round(hoursLeft / HOURS_PER_DAY)) };
};

// The user's own two numbers, divided. Stated, never advised - and never
// converted into a calorie figure, which is the one thing this app refuses to
// recommend.
export const projectedTargetDate = (goal: WeightGoal, currentKg: number, today: string): string | null => {
  if (goal.mode !== "target" || goal.targetWeightKg === null || goal.rateKgPerWeek === null) return null;
  const remainingKg = Math.abs(goal.targetWeightKg - currentKg);
  if (remainingKg === 0) return null;
  return addCalendarDays(today, Math.ceil((remainingKg / goal.rateKgPerWeek) * DAYS_PER_WEEK));
};

// Exact kg. Every figure here is rounded once, at the copy layer, in the unit
// it is printed in.
export const weightChange = (latest: WeightEntry, previous: WeightEntry | null): number | null =>
  previous === null ? null : latest.weightKg - previous.weightKg;
