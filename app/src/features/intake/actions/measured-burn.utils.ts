/**
 * Maintenance calories worked out from what the user actually logged, rather
 * than from a published formula (spec §4).
 *
 * Energy balance over a window: whatever they ate, minus whatever their weight
 * change was worth in calories, is what they burned. Both halves carry a
 * standard error, and the two combine into the range the estimate shows. Pure
 * throughout - the store module feeds it rows and it returns a verdict.
 */
import { addCalendarDays } from "@/lib/date/day-bounds";

import { KCAL_PER_KG } from "./intake.utils";

/** One local calendar day's logged energy. A day with no meal has no entry. */
export interface LoggedDay {
  date: string;
  kcal: number;
}

/** One weigh-in. At most one per local day - weight_entries enforces that. */
export interface WeightReading {
  date: string;
  weightKg: number;
}

export type MeasuredBurn =
  | { kind: "measured"; kcal: number; sigma: number; windowDays: number; loggedDays: number }
  | { kind: "insufficient"; loggedDays: number; readings: number };

// JUDGMENT - the slope's standard error divides by (n - 2), so three readings
// is the arithmetic floor. Five is the first count where that error is a
// measurement rather than mostly noise about itself.
const MIN_READINGS = 5;

// JUDGMENT - four fifths of the window logged. Below this the unlogged days
// bias the mean rather than merely widening it, and no statistic repairs bias
// (spec §5).
const MIN_COVERAGE = 0.8;

// JUDGMENT - below the +/-10% Mifflin band at any realistic maintenance, so a
// measured figure is never looser than the formula it replaces.
const MAX_STD_ERR_KCAL = 150;

// JUDGMENT - two weeks is the shortest window worth fitting, eight the longest
// worth waiting for. Spec §4.7 shows two weeks rarely clears the ceiling; the
// floor is kept anyway so a lucky series is not refused on principle.
const MIN_WINDOW_DAYS = 14;
export const MAX_WINDOW_DAYS = 56;

// A straight line costs two degrees of freedom, so the residual variance needs
// at least three points to exist at all.
const FIT_PARAMETERS = 2;
const MIN_FIT_POINTS = 3;

const MS_PER_DAY = 86_400_000;

const mean = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0) / values.length;

const sumOf = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

// Both strings are ISO calendar dates, so parsing them at UTC midnight is
// timezone-free arithmetic - the local-day question was already answered
// upstream, when the rows were bucketed.
const dayIndex = (start: string, date: string): number =>
  Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / MS_PER_DAY);

const windowStart = (today: string, windowDays: number): string => addCalendarDays(today, -(windowDays - 1));

interface Fit {
  slopeKgPerDay: number;
  slopeStdErr: number;
}

/**
 * Ordinary least squares of weight on day index.
 *
 * Null rather than a figure when the fit is undefined: fewer than three points
 * leaves no residual degrees of freedom, and readings that all land on one day
 * leave the slope's denominator at zero. Both would otherwise surface as NaN
 * on a user's screen.
 */
const fitSlope = (points: readonly { day: number; weightKg: number }[]): Fit | null => {
  if (points.length < MIN_FIT_POINTS) return null;
  const dayMean = mean(points.map((point) => point.day));
  const weightMean = mean(points.map((point) => point.weightKg));
  const dayVariation = sumOf(points.map((point) => (point.day - dayMean) ** 2));
  if (dayVariation === 0) return null;
  const covariation = sumOf(points.map((point) => (point.day - dayMean) * (point.weightKg - weightMean)));
  const slopeKgPerDay = covariation / dayVariation;
  const residuals = points.map((point) => point.weightKg - (weightMean + slopeKgPerDay * (point.day - dayMean)));
  const residualVariance = sumOf(residuals.map((residual) => residual ** 2)) / (points.length - FIT_PARAMETERS);
  return { slopeKgPerDay, slopeStdErr: Math.sqrt(residualVariance / dayVariation) };
};

interface IntakeStats {
  meanKcal: number;
  stdErr: number;
}

// One logged day has no spread to measure. Its error is reported as zero
// rather than NaN; such a window fails MIN_READINGS long before this matters.
const intakeStats = (kcals: readonly number[]): IntakeStats => {
  const meanKcal = mean(kcals);
  if (kcals.length < FIT_PARAMETERS) return { meanKcal, stdErr: 0 };
  const variance = sumOf(kcals.map((kcal) => (kcal - meanKcal) ** 2)) / (kcals.length - 1);
  return { meanKcal, stdErr: Math.sqrt(variance / kcals.length) };
};

interface WindowFit {
  kcal: number;
  sigma: number;
  windowDays: number;
  loggedDays: number;
}

const evaluateWindow = (
  logged: readonly LoggedDay[],
  readings: readonly WeightReading[],
  today: string,
  windowDays: number,
): WindowFit | null => {
  const start = windowStart(today, windowDays);
  // Inclusive of both ends, and a future-dated row is outside every window: a
  // device clock running ahead must not bend the slope.
  const inWindow = (date: string): boolean => date >= start && date <= today;
  const days = logged.filter((day) => inWindow(day.date));
  const weighed = readings.filter((reading) => inWindow(reading.date));
  if (weighed.length < MIN_READINGS) return null;
  if (days.length / windowDays < MIN_COVERAGE) return null;
  const fit = fitSlope(weighed.map((reading) => ({ day: dayIndex(start, reading.date), weightKg: reading.weightKg })));
  if (!fit) return null;
  const intake = intakeStats(days.map((day) => day.kcal));
  // Independent errors add in quadrature (spec §4.5).
  const sigma = Math.hypot(intake.stdErr, KCAL_PER_KG * fit.slopeStdErr);
  if (sigma > MAX_STD_ERR_KCAL) return null;
  return {
    // Losing means a negative slope, so the subtraction adds the deficit back.
    kcal: intake.meanKcal - fit.slopeKgPerDay * KCAL_PER_KG,
    sigma,
    windowDays,
    loggedDays: days.length,
  };
};

const countsAt = (
  logged: readonly LoggedDay[],
  readings: readonly WeightReading[],
  today: string,
  windowDays: number,
): { loggedDays: number; readings: number } => {
  const start = windowStart(today, windowDays);
  const inWindow = (date: string): boolean => date >= start && date <= today;
  return {
    loggedDays: logged.filter((day) => inWindow(day.date)).length,
    readings: readings.filter((reading) => inWindow(reading.date)).length,
  };
};

/**
 * The shortest window that can support a figure wins, so the answer uses the
 * most recent data that qualifies. Nothing qualifies and the caller gets both
 * counts over the longest window - either one can be the blocker, and they
 * fail independently.
 */
export const measuredBurn = (
  logged: readonly LoggedDay[],
  readings: readonly WeightReading[],
  today: string,
): MeasuredBurn => {
  for (let windowDays = MIN_WINDOW_DAYS; windowDays <= MAX_WINDOW_DAYS; windowDays += 1) {
    const fit = evaluateWindow(logged, readings, today, windowDays);
    if (fit) return { kind: "measured", ...fit };
  }
  return { kind: "insufficient", ...countsAt(logged, readings, today, MAX_WINDOW_DAYS) };
};
