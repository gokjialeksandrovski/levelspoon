import { notFound, redirect } from "next/navigation";

import { getDayLog } from "@/features/meals/actions/meals";
import { TimezoneRefresh } from "@/components/layout/timezone-refresh";
import { todayLocalDateString } from "@/lib/date/day-bounds";
import { requestTimezone } from "@/lib/date/request-timezone";

import { DayView, type DayLoad } from "./day-view";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface DayPageProps {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ deleted?: string | string[] }>;
}

const loadDay = (date: string, timezone: string): Promise<DayLoad> =>
  getDayLog(date, timezone).then(
    (log): DayLoad => ({ status: "ready", log }),
    (error: unknown): DayLoad => {
      console.error("Loading the day failed", date, error);
      return { status: "error" };
    },
  );

const DayPage = async ({ params, searchParams }: DayPageProps) => {
  const [{ date }, { deleted }, timezone] = await Promise.all([params, searchParams, requestTimezone()]);
  if (!DATE_PATTERN.test(date)) {
    notFound();
  }
  if (!timezone) {
    return <TimezoneRefresh />;
  }
  const today = todayLocalDateString(timezone);
  // A future day has nothing to log and the header offers no way forward to
  // it, so a typed or stale URL lands on today instead of an empty tomorrow.
  if (date > today) {
    redirect(`/day/${today}`);
  }
  // Not awaited: the shell renders now and DayView suspends on the read.
  // `deleted` is set by DeleteMeal on its way here, so this day can offer Undo.
  return (
    <DayView
      date={date}
      today={today}
      deletedMealId={typeof deleted === "string" ? deleted : null}
      load={loadDay(date, timezone)}
    />
  );
};

export default DayPage;
