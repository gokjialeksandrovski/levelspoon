// No "use server": this takes a userId, so as a Server Action it would let a
// browser read any user's log and weigh-ins. intake.ts resolves the user and
// calls in.
import { dailyKcalTotals } from "@/features/meals/actions/meals.store";
import { fetchWeightReadings } from "@/features/weight/actions/weight.store";
import { addCalendarDays, todayLocalDateString } from "@/lib/date/day-bounds";

import { MAX_WINDOW_DAYS, measuredBurn, type MeasuredBurn } from "./measured-burn.utils";

/**
 * Reads the longest window the maths could possibly use, once, and lets the
 * pure function pick the window inside it. Two round trips, no storage: the
 * figure is derived, and intake_profiles keeps no derived figure (spec §3).
 */
export const measuredBurnFor = async (userId: string, timezone: string): Promise<MeasuredBurn> => {
  const today = todayLocalDateString(timezone);
  const from = addCalendarDays(today, -(MAX_WINDOW_DAYS - 1));
  const [logged, readings] = await Promise.all([
    dailyKcalTotals(userId, from, today, timezone),
    fetchWeightReadings(userId, from, today),
  ]);
  return measuredBurn(logged, readings, today);
};
