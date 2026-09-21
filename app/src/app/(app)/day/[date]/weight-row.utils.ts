// app/src/app/(app)/day/[date]/weight-row.utils.ts
import {
  projectedTargetDate,
  weightChange,
  type CheckinCountdown,
  type WeightEntry,
  type WeightGoal,
  type WeightProgress,
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

// Trailing zeros off: "holding 78 ±1" is what the user typed, and "78.0 ±1.0"
// reads as a precision the band does not have.
const kg = (value: number): string => String(value);

const signed = (value: number): string =>
  value < 0 ? `${MINUS_SIGN}${Math.abs(value)}` : `+${value}`;

const holdingText = (goal: WeightGoal): string =>
  `holding ${kg(goal.startWeightKg)} ±${kg(goal.holdBandKg ?? 0)}`;

const bandSideText = (outsideByKg: number): string =>
  outsideByKg > 0
    ? `${kg(outsideByKg)} kg above the band`
    : `${kg(Math.abs(outsideByKg))} kg below the band`;

export const progressLineText = (progress: WeightProgress, goal: WeightGoal): string => {
  switch (progress.kind) {
    case "no-entries":
      return "Log your first weight";
    case "reached":
      return `${kg(progress.currentKg)} kg · target reached`;
    case "holding": {
      const base = `${kg(progress.currentKg)} kg · ${holdingText(goal)}`;
      return progress.outsideByKg === 0 ? base : `${base} · ${bandSideText(progress.outsideByKg)}`;
    }
    case "losing":
    case "gaining":
      return `${kg(progress.currentKg)} kg · ${kg(progress.remainingKg)} to go · ${kg(goal.rateKgPerWeek ?? 0)} kg/wk`;
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
): string => {
  const weekday = WEEKDAY_FORMATTER.format(localDate(nextDate));
  const aim =
    goal.mode === "hold"
      ? `holding ${kg(goal.startWeightKg)} kg`
      : `target ${kg(goal.targetWeightKg ?? 0)} kg`;
  return `Next weigh-in ${weekday} · ${countdownText(countdown)} · ${aim}`;
};

export const projectionLineText = (goal: WeightGoal, currentKg: number, today: string): string | null => {
  const date = projectedTargetDate(goal, currentKg, today);
  if (date === null) return null;
  return `At ${kg(goal.rateKgPerWeek ?? 0)} kg/week, ${kg(goal.targetWeightKg ?? 0)} kg around ${DAY_MONTH_FORMATTER.format(localDate(date))}`;
};

export const lastChangeText = (
  latest: WeightEntry,
  previous: WeightEntry | null,
  goal: WeightGoal,
): string => {
  const started = `Started ${kg(goal.startWeightKg)} kg on ${DAY_MONTH_FORMATTER.format(localDate(goal.startDate))}`;
  const change = weightChange(latest, previous);
  return change === null ? started : `${started} · last change ${signed(change)} kg`;
};
