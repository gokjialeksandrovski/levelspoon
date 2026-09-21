// app/src/app/(app)/day/[date]/weight-row.utils.ts
import {
  displayWeight,
  projectedTargetDate,
  weightChange,
  type CheckinCountdown,
  type WeightEntry,
  type WeightGoal,
  type WeightProgress,
  type WeightUnit,
} from "@/features/weight/actions/weight.utils";

// U+2212 minus, not a hyphen: a hyphen beside a tabular figure reads as a
// list dash at text-sm.
const MINUS_SIGN = "−";

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-GB", { weekday: "long" });
const DAY_MONTH_FORMATTER = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" });

const localDate = (date: string): Date => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
};

// Every stored figure is kg; this is the one place it becomes the unit on
// screen, and the only place it is rounded. Trailing zeros off: "holding 78
// ±1" is what the user typed, and "78.0 ±1.0" reads as a precision the band
// does not have.
const show = (weightKg: number, unit: WeightUnit): string => String(displayWeight(weightKg, unit));

const signed = (weightKg: number, unit: WeightUnit): string => {
  const value = displayWeight(weightKg, unit);
  return value < 0 ? `${MINUS_SIGN}${Math.abs(value)}` : `+${value}`;
};

const holdingText = (goal: WeightGoal, unit: WeightUnit): string =>
  `holding ${show(goal.startWeightKg, unit)} ±${show(goal.holdBandKg ?? 0, unit)}`;

const bandSideText = (outsideByKg: number, unit: WeightUnit): string =>
  outsideByKg > 0
    ? `${show(outsideByKg, unit)} ${unit} above the band`
    : `${show(Math.abs(outsideByKg), unit)} ${unit} below the band`;

export const progressLineText = (progress: WeightProgress, goal: WeightGoal, unit: WeightUnit): string => {
  switch (progress.kind) {
    case "no-entries":
      return "Log your first weight";
    case "reached":
      return `${show(progress.currentKg, unit)} ${unit} · target reached`;
    case "holding": {
      const base = `${show(progress.currentKg, unit)} ${unit} · ${holdingText(goal, unit)}`;
      return progress.outsideByKg === 0 ? base : `${base} · ${bandSideText(progress.outsideByKg, unit)}`;
    }
    case "losing":
    case "gaining":
      return `${show(progress.currentKg, unit)} ${unit} · ${show(progress.remainingKg, unit)} to go · ${show(goal.rateKgPerWeek ?? 0, unit)} ${unit}/wk`;
  }
};

export const countdownText = (countdown: CheckinCountdown): string => {
  switch (countdown.kind) {
    case "due":
      return "";
    case "imminent":
      return "in under an hour";
    case "hours":
      return `in ${countdown.hours} ${countdown.hours === 1 ? "hour" : "hours"}`;
    case "days":
      return `in ${countdown.days} ${countdown.days === 1 ? "day" : "days"}`;
  }
};

export const nextCheckinLineText = (
  nextDate: string,
  countdown: CheckinCountdown,
  goal: WeightGoal,
  unit: WeightUnit,
): string => {
  const weekday = WEEKDAY_FORMATTER.format(localDate(nextDate));
  const aim =
    goal.mode === "hold"
      ? `holding ${show(goal.startWeightKg, unit)} ${unit}`
      : `target ${show(goal.targetWeightKg ?? 0, unit)} ${unit}`;
  return `Next weigh-in ${weekday} · ${countdownText(countdown)} · ${aim}`;
};

export const projectionLineText = (
  goal: WeightGoal,
  currentKg: number,
  today: string,
  unit: WeightUnit,
): string | null => {
  const date = projectedTargetDate(goal, currentKg, today);
  if (date === null) return null;
  const rate = show(goal.rateKgPerWeek ?? 0, unit);
  const target = show(goal.targetWeightKg ?? 0, unit);
  return `At ${rate} ${unit}/week, ${target} ${unit} around ${DAY_MONTH_FORMATTER.format(localDate(date))}`;
};

export const lastChangeText = (
  latest: WeightEntry,
  previous: WeightEntry | null,
  goal: WeightGoal,
  unit: WeightUnit,
): string => {
  const started = `Started ${show(goal.startWeightKg, unit)} ${unit} on ${DAY_MONTH_FORMATTER.format(localDate(goal.startDate))}`;
  const change = weightChange(latest, previous);
  return change === null ? started : `${started} · last change ${signed(change, unit)} ${unit}`;
};
