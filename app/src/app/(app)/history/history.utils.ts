/**
 * Shaping for the history list: what the server returns is one row per day
 * that carries food, newest first, and the screen has to read as a calendar.
 *
 * Two things happen here. Days nobody logged are put back, because a list that
 * silently skips them cannot answer "did I forget Tuesday, or did I eat
 * nothing?" - and since a missed day is now loggable, each one is somewhere to
 * go rather than a hole. Then the rows are cut into months, so a long scroll
 * keeps saying where it is.
 */
import type { DayHistoryEntry } from "@/features/meals/actions/meals";
import { addCalendarDays } from "@/lib/date/day-bounds";

export type HistoryRow =
  | { kind: "logged"; date: string; totalKcal: number }
  | { kind: "unlogged"; date: string }
  /** A stretch too long to list day by day; `date` is its newest day. */
  | { kind: "gap"; date: string; days: number };

export interface HistoryMonth {
  /** Stable across pages, so appending rows never re-keys a rendered month. */
  key: string;
  label: string;
  rows: HistoryRow[];
}

// A week's worth of blank days still reads as a list of days somebody could go
// and fill in. Past that it is a break from the app rather than days missed,
// and forty tappable blanks would bury the days that do carry food.
const MAX_GAP_FILL_DAYS = 6;

// Seven complete days is the shortest window whose average survives one big
// dinner, and it is the span the user can still remember eating.
const RECENT_AVERAGE_DAYS = 7;

// One figure is not an average, and calling it one would dress a single day up
// as a habit.
const MIN_AVERAGE_DAYS = 2;

const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const MILLISECONDS_PER_SECOND = 1000;
const ONE_DAY_MS = HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;

// Both dates are calendar dates with no timezone of their own, so they are
// compared as UTC midnights - the same footing addCalendarDays uses.
const calendarDaysBetween = (older: string, newer: string): number =>
  (Date.parse(`${newer}T00:00:00Z`) - Date.parse(`${older}T00:00:00Z`)) / ONE_DAY_MS;

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-GB", { month: "long" });
const MONTH_YEAR_FORMATTER = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

const YEAR_LENGTH = 4;
const monthKey = (date: string): string => date.slice(0, "YYYY-MM".length);
const yearOf = (date: string): string => date.slice(0, YEAR_LENGTH);

// The year is dropped inside the current one for the same reason the day list
// says "Yesterday": the reader already knows which year they are in.
export const monthLabel = (date: string, today: string): string => {
  const [year, month] = date.split("-").map(Number);
  const asDate = new Date(Date.UTC(year, month - 1, 1));
  return yearOf(date) === yearOf(today) ? MONTH_FORMATTER.format(asDate) : MONTH_YEAR_FORMATTER.format(asDate);
};

const missingRowsBetween = (older: string, newer: string): HistoryRow[] => {
  const missing = calendarDaysBetween(older, newer) - 1;
  if (missing <= 0) return [];
  if (missing > MAX_GAP_FILL_DAYS) return [{ kind: "gap", date: addCalendarDays(newer, -1), days: missing }];
  return Array.from({ length: missing }, (_, index) => ({
    kind: "unlogged" as const,
    date: addCalendarDays(newer, -(index + 1)),
  }));
};

/**
 * Logged days with the days between them put back, newest first.
 *
 * Only the runs *between* two loaded days are filled: the stretch above the
 * newest entry belongs to a day the user just came from, and the stretch below
 * the oldest one may be the next page rather than a gap at all.
 */
export const withUnloggedDays = (entries: DayHistoryEntry[]): HistoryRow[] =>
  entries.flatMap((entry, index) => {
    const logged: HistoryRow = { kind: "logged", date: entry.date, totalKcal: entry.totalKcal };
    const older = entries[index + 1];
    return older ? [logged, ...missingRowsBetween(older.date, entry.date)] : [logged];
  });

export const toHistoryMonths = (entries: DayHistoryEntry[], today: string): HistoryMonth[] =>
  withUnloggedDays(entries).reduce<HistoryMonth[]>((months, row) => {
    const key = monthKey(row.date);
    const current = months[months.length - 1];
    if (current?.key === key) {
      return [...months.slice(0, -1), { ...current, rows: [...current.rows, row] }];
    }
    return [...months, { key, label: monthLabel(row.date, today), rows: [row] }];
  }, []);

export interface RecentAverage {
  days: number;
  kcal: number;
}

/**
 * Mean kcal over the most recent complete logged days.
 *
 * Today is left out however much is in it: a day still being eaten would drag
 * the figure down every morning and call it a trend. Only logged days count,
 * which the copy beside it has to say - the average of the days you logged is
 * not the average of the days that passed.
 */
export const recentAverage = (entries: DayHistoryEntry[], today: string): RecentAverage | null => {
  const complete = entries.filter((entry) => entry.date !== today).slice(0, RECENT_AVERAGE_DAYS);
  if (complete.length < MIN_AVERAGE_DAYS) return null;
  const total = complete.reduce((sum, entry) => sum + entry.totalKcal, 0);
  return { days: complete.length, kcal: Math.round(total / complete.length) };
};
