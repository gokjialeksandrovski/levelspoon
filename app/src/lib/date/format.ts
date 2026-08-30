/**
 * Human-friendly label for a day-view date ("Today" / "Yesterday" / "Sat 30
 * Aug"), used by AppHeader's day variant.
 *
 * `date` is already a local calendar-date string produced upstream (via
 * todayLocalDateString against the browser's timezone), so comparing it
 * against `now`'s own local getters keeps both sides on the same footing
 * without this function re-deriving a timezone of its own.
 */
import { addCalendarDays } from "./day-bounds";

const pad = (value: number): string => String(value).padStart(2, "0");

const localDateString = (instant: Date): string =>
  `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}`;

const WEEKDAY_DAY_MONTH_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

const formatOlderDate = (date: string): string => {
  const [year, month, day] = date.split("-").map(Number);
  return WEEKDAY_DAY_MONTH_FORMATTER.format(new Date(year, month - 1, day));
};

export const formatDayLabel = (date: string, now: Date = new Date()): string => {
  const today = localDateString(now);
  if (date === today) return "Today";
  if (date === addCalendarDays(today, -1)) return "Yesterday";
  return formatOlderDate(date);
};
