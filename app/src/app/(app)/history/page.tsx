import { getDayHistory } from "@/features/meals/actions/meals";
import { TimezoneRefresh } from "@/components/layout/timezone-refresh";
import { todayLocalDateString } from "@/lib/date/day-bounds";
import { requestTimezone } from "@/lib/date/request-timezone";

import { HistoryView, type HistoryLoad } from "./history-view";
import { HISTORY_PAGES_PARAM, parsePageCount } from "./history.utils";

const loadFirstPage = (pageCount: number): Promise<HistoryLoad> =>
  getDayHistory(0, pageCount).then(
    (page): HistoryLoad => ({ status: "ready", page }),
    (error: unknown): HistoryLoad => {
      console.error("Loading history failed", error);
      return { status: "error" };
    },
  );

interface HistoryPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// Not awaited: the header and skeleton render now and HistoryView suspends
// on the read.
const HistoryPage = async ({ searchParams }: HistoryPageProps) => {
  const [params, timezone] = await Promise.all([searchParams, requestTimezone()]);
  if (!timezone) {
    return <TimezoneRefresh />;
  }
  const pageCount = parsePageCount(params[HISTORY_PAGES_PARAM]);
  return <HistoryView today={todayLocalDateString(timezone)} load={loadFirstPage(pageCount)} />;
};

export default HistoryPage;
