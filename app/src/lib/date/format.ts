/**
 * Human-friendly label for a day-view date ("Today" / "Yesterday" / "Sat 30
 * Aug"), used by AppHeader's day variant.
 *
 * `today` comes from the server's timezone cookie, not this function's clock:
 * a server and browser in different zones would otherwise label the same day
 * differently and break hydration.
 */
import { addCalendarDays } from "./day-bounds";

const WEEKDAY_DAY_MONTH_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

// Also the date in a shared meal's text, where "Today" would be wrong by the
// time someone reads it.
export const formatCalendarDate = (date: string): string => {
  const [year, month, day] = date.split("-").map(Number);
  return WEEKDAY_DAY_MONTH_FORMATTER.format(new Date(year, month - 1, day));
};

export const formatDayLabel = (date: string, today: string): string => {
  if (date === today) return "Today";
  if (date === addCalendarDays(today, -1)) return "Yesterday";
  return formatCalendarDate(date);
};
