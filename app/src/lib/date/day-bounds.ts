/**
 * Timezone-aware calendar-day boundaries (design spec §2).
 *
 * Pure functions only - no I/O, no server dependency - so day view, meal
 * detail's day-total, and history can all share one tested implementation
 * instead of each hand-rolling `Date` arithmetic that breaks across DST.
 */

export interface DayBounds {
  start: Date; // UTC instant of local midnight starting `date` in `timezone`
  end: Date; // UTC instant of local midnight starting the next calendar day
}

const MINUTES_TO_MS = 60_000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const offsetFormatter = (timeZone: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

// How far "local time in `timeZone`" is ahead of UTC at the moment `instant`
// actually occurs - not a fixed value, since a zone's offset changes across
// a DST transition. Reads the wall clock Intl reports for that exact instant
// and compares it back to the instant itself, so it's correct on both sides
// of a transition without hardcoding any rule about when transitions happen.
const timeZoneOffsetMinutes = (instant: Date, timeZone: string): number => {
  const parts = offsetFormatter(timeZone).formatToParts(instant);
  const numberPart = (type: string): number => Number(parts.find((part) => part.type === type)?.value);
  const wallClockAsUtc = Date.UTC(
    numberPart("year"),
    numberPart("month") - 1,
    numberPart("day"),
    numberPart("hour"),
    numberPart("minute"),
    numberPart("second"),
  );
  return (wallClockAsUtc - instant.getTime()) / MINUTES_TO_MS;
};

const localMidnightUtcInstant = (date: string, timezone: string): Date => {
  const [year, month, day] = date.split("-").map(Number);
  const naiveGuess = Date.UTC(year, month - 1, day);
  const offsetMinutes = timeZoneOffsetMinutes(new Date(naiveGuess), timezone);
  return new Date(naiveGuess - offsetMinutes * MINUTES_TO_MS);
};

// Pure calendar-date arithmetic ("what date is N days from this one"), not
// wall-clock arithmetic - so this never touches a timezone. Both the day
// view's prev/next navigation and dayBoundsInTimezone's own end-of-day
// calculation share this instead of each reimplementing +/- a day.
export const addCalendarDays = (date: string, days: number): string => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) + days * ONE_DAY_MS).toISOString().slice(0, 10);
};

export const dayBoundsInTimezone = (date: string, timezone: string): DayBounds => ({
  start: localMidnightUtcInstant(date, timezone),
  end: localMidnightUtcInstant(addCalendarDays(date, 1), timezone),
});

// "YYYY-MM-DD" for "now" as experienced in `timezone` - en-CA is what makes
// this a one-line implementation rather than manual string assembly.
export const todayLocalDateString = (timezone: string): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
