/**
 * Shaping for the history list: what the server returns is one row per day
 * that carries food, newest first, and the screen has to read as a calendar.
 *
 * Two things happen here. Days nobody logged are put back, because a list that
 * silently skips them cannot answer "did I forget Tuesday, or did I eat
 * nothing?" - and a missed day is loggable, so each one is somewhere to go
 * rather than a hole. Then the rows are cut into months, so a long scroll
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
// dinner, and it is the span the user can still remember eating. The first
// history page (HISTORY_PAGE_SIZE logged days) always reaches past it.
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

/** One day of the week strip; `kcal` is null on a day with nothing logged. */
export interface WeekDay {
  date: string;
  kcal: number | null;
}

export interface WeekSummary {
  /** Oldest first, so the strip reads left to right like a calendar row. */
  days: WeekDay[];
  loggedDays: number;
  averageKcal: number;
}

/**
 * The last week of complete days: which ones were logged, and what the logged
 * ones averaged.
 *
 * Today is left out however much is in it: a day still being eaten would drag
 * the average down every morning and call it a trend. The average is over the
 * logged days only, which the copy beside it has to say - the average of the
 * days you logged is not the average of the days that passed.
 *
 * With no older page, the oldest loaded day is the first one ever logged, and
 * the window starts there: days before somebody started using the app were not
 * missed.
 */
export const weekSummary = (entries: DayHistoryEntry[], today: string, hasOlderPages: boolean): WeekSummary | null => {
  const newest = addCalendarDays(today, -1);
  const oldestEntry = entries[entries.length - 1];
  const reach = hasOlderPages || !oldestEntry ? RECENT_AVERAGE_DAYS : calendarDaysBetween(oldestEntry.date, newest) + 1;
  const length = Math.min(RECENT_AVERAGE_DAYS, reach);
  const kcalByDate = new Map(entries.map((entry) => [entry.date, entry.totalKcal]));
  const days = Array.from({ length: Math.max(0, length) }, (_, index) => {
    const date = addCalendarDays(newest, index - length + 1);
    return { date, kcal: kcalByDate.get(date) ?? null };
  });
  const logged = days.flatMap((day) => (day.kcal === null ? [] : [day.kcal]));
  if (logged.length < MIN_AVERAGE_DAYS) return null;
  const total = logged.reduce((sum, kcal) => sum + kcal, 0);
  return { days, loggedDays: logged.length, averageKcal: Math.round(total / logged.length) };
};

// The URL records how deep "Load more" went, so Back lands on the same rows.
export const HISTORY_PAGES_PARAM = "pages";

export const parsePageCount = (raw: string | string[] | undefined): number => {
  const count = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(count) && count > 1 ? count : 1;
};
