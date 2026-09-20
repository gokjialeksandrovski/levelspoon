// app/src/features/weight/actions/weight.utils.ts
// Lives here, not in weight.ts: weight.ts is "use server", which may only
// export async functions. Same split as goals.ts / goals.utils.ts.
import { addCalendarDays, dayBoundsInTimezone } from "@/lib/date/day-bounds";

// Storage-and-typing guards, not medical opinion - the same stance as
// MIN_CALORIE_GOAL. A numeric(5,1) column plus a plausible adult reading need
// nothing outside this range, so a value past it is a slipped keystroke.
export const MIN_WEIGHT_KG = 30;
export const MAX_WEIGHT_KG = 300;

export const MIN_RATE_KG_PER_WEEK = 0.1;
export const MAX_RATE_KG_PER_WEEK = 1.5;
export const MIN_BAND_KG = 0.5;
export const MAX_BAND_KG = 3;

// Offered as chips. Typing is not offered for the rate: unlike a calorie goal,
// every rate a user means is one of these four.
const QUARTER_KG_PER_WEEK = 0.25;
const HALF_KG_PER_WEEK = 0.5;
const THREE_QUARTER_KG_PER_WEEK = 0.75;
const ONE_KG_PER_WEEK = 1;
export const PACE_CHOICES = [
  QUARTER_KG_PER_WEEK,
  HALF_KG_PER_WEEK,
  THREE_QUARTER_KG_PER_WEEK,
  ONE_KG_PER_WEEK,
] as const;
export const DEFAULT_PACE_KG_PER_WEEK = HALF_KG_PER_WEEK;

// One week is the floor, confirmed with the user: a daily reading is scale
// noise, not progress.
const WEEKLY_DAYS = 7;
const FORTNIGHTLY_DAYS = 14;
const MONTHLY_DAYS = 30;
export const CHECKIN_INTERVALS = [WEEKLY_DAYS, FORTNIGHTLY_DAYS, MONTHLY_DAYS] as const;
export const DEFAULT_CHECKIN_INTERVAL_DAYS = WEEKLY_DAYS;
export const DEFAULT_BAND_KG = 1;

const TENTHS_PER_UNIT = 10;
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
  checkinIntervalDays: number;
}

export interface WeightEntry {
  measuredOn: string;
  weightKg: number;
}

export interface WeightView {
  goal: WeightGoal;
  latest: WeightEntry | null;
  /** The reading before `latest`, for the panel's "last change" line only. */
  previous: WeightEntry | null;
  nextCheckinDate: string;
}

export interface WeightGoalInput {
  mode: WeightGoalMode;
  currentWeightKg: number;
  targetWeightKg: number | null;
  rateKgPerWeek: number | null;
  holdBandKg: number | null;
  checkinIntervalDays: number;
}

export type InvalidGoalReason =
  | "weight"
  | "target"
  | "rate"
  | "band"
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

const clampShare = (share: number): number => Math.min(1, Math.max(0, share));

export const isValidWeightKg = (weightKg: number): boolean =>
  Number.isFinite(weightKg) && weightKg >= MIN_WEIGHT_KG && weightKg <= MAX_WEIGHT_KG;

// A comma is the decimal separator on the keyboards this app is used on, and
// the nutrition parser already treats it as one.
const parseWeightDraft = (draft: string): number => Number(draft.trim().replace(",", "."));

export const isUnusableWeightDraft = (draft: string): boolean =>
  !isValidWeightKg(parseWeightDraft(draft));

// Runs on blur, never per keystroke: rounding mid-typing rewrites "7" into a
// value the next digit lands after, so the reading is never typeable.
export const commitWeightDraft = (draft: string, currentKg: number): number =>
  isUnusableWeightDraft(draft) ? currentKg : roundToTenth(parseWeightDraft(draft));

const inRange = (value: number, min: number, max: number): boolean =>
  Number.isFinite(value) && value >= min && value <= max;

const targetGoalError = (input: WeightGoalInput): InvalidGoalReason | null => {
  if (input.targetWeightKg === null || !isValidWeightKg(input.targetWeightKg)) return "target";
  if (input.rateKgPerWeek === null || !inRange(input.rateKgPerWeek, MIN_RATE_KG_PER_WEEK, MAX_RATE_KG_PER_WEEK)) {
    return "rate";
  }
  if (input.holdBandKg !== null) return "band";
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
  if (!CHECKIN_INTERVALS.includes(input.checkinIntervalDays as (typeof CHECKIN_INTERVALS)[number])) return "cadence";
  return input.mode === "target" ? targetGoalError(input) : holdGoalError(input);
};

const holdProgress = (goal: WeightGoal, currentKg: number): WeightProgress => {
  const centerKg = goal.startWeightKg;
  const bandKg = goal.holdBandKg ?? DEFAULT_BAND_KG;
  const low = centerKg - bandKg;
  const high = centerKg + bandKg;
  const outsideKg = currentKg > high ? currentKg - high : Math.min(0, currentKg - low);
  return {
    kind: "holding",
    currentKg,
    centerKg,
    bandKg,
    outsideByKg: roundToTenth(outsideKg),
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
    remainingKg: roundToTenth(Math.abs(targetKg - currentKg)),
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

export const weightChange = (latest: WeightEntry, previous: WeightEntry | null): number | null =>
  previous === null ? null : roundToTenth(latest.weightKg - previous.weightKg);
