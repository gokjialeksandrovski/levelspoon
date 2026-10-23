"use client";

import { useReducedMotion } from "motion/react";
import * as motion from "motion/react-m";
import Link from "next/link";
import { Suspense, use, useCallback, useEffect, useRef, useState } from "react";

import { getDayHistory } from "@/features/meals/actions/meals";
import { HISTORY_PAGE_SIZE } from "@/features/meals/actions/meals.utils";
import type { DayHistoryEntry, DayHistoryPage } from "@/features/meals/actions/meals";
import { calorieRemaining } from "@/features/goals/actions/goals.utils";
import type { CalorieRemaining } from "@/features/goals/actions/goals.utils";
import { AppHeader } from "@/components/layout/app-header";
import { Button, buttonClassName } from "@/components/ui/button";
import { DelayedFallback } from "@/components/ui/delayed-fallback";
import { InlineMessage } from "@/components/ui/inline-message";
import { LiveStatus } from "@/components/ui/live-status";
import { Skeleton } from "@/components/ui/skeleton";
import { FOCUS_RING } from "@/components/ui/tap-target";
import { formatDayLabel } from "@/lib/date/format";
import { contentFadeInitial, contentFadeTransition } from "@/lib/motion/step-transition";
import { formatNumber } from "@/lib/nutrition/format-number";

import { HISTORY_PAGES_PARAM, toHistoryMonths, weekSummary } from "./history.utils";
import type { HistoryMonth, HistoryRow, WeekDay, WeekSummary } from "./history.utils";

// The first page is read on the server and handed down unresolved; a failed
// read resolves to "error" rather than rejecting.
export type HistoryLoad = { status: "ready"; page: DayHistoryPage } | { status: "error" };

interface HistoryState {
  entries: DayHistoryEntry[];
  nextOffset: number | null;
  calorieGoal: number | null;
}

const appendPage = (previous: HistoryState, page: DayHistoryPage): HistoryState => ({
  entries: [...previous.entries, ...page.entries],
  nextOffset: page.nextOffset,
  calorieGoal: page.calorieGoal,
});

// The native call, not router.replace: Next syncs it without a server
// round-trip, so the rows on screen stay put. Back then reloads this depth.
const recordLoadedPages = (loadedThrough: number): void => {
  window.history.replaceState(null, "", `?${HISTORY_PAGES_PARAM}=${Math.ceil(loadedThrough / HISTORY_PAGE_SIZE)}`);
};

interface UseHistoryStateResult {
  state: HistoryState;
  loadMore: (offset: number) => void;
  isLoadingMore: boolean;
  loadMoreFailed: boolean;
}

const useHistoryState = (firstPage: DayHistoryPage): UseHistoryStateResult => {
  const [state, setState] = useState<HistoryState>({
    entries: firstPage.entries,
    nextOffset: firstPage.nextOffset,
    calorieGoal: firstPage.calorieGoal,
  });
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  // A ref, not isLoadingMore: two taps in the same frame both read the old
  // state value, so only a ref actually blocks the duplicate request.
  const isFetchingMore = useRef(false);

  // Failure here keeps the rows already on screen and reports next to the
  // button: dropping to an error state would blank page 1 because page 2
  // failed. A duplicate request would append the same page twice, so it
  // costs rows, not just a wasted call.
  const loadMore = useCallback((offset: number): void => {
    if (isFetchingMore.current) return;
    isFetchingMore.current = true;
    setIsLoadingMore(true);
    setLoadMoreFailed(false);
    getDayHistory(offset)
      .then((page) => {
        setState((previous) => appendPage(previous, page));
        recordLoadedPages(offset + HISTORY_PAGE_SIZE);
      })
      .catch(() => setLoadMoreFailed(true))
      .finally(() => {
        isFetchingMore.current = false;
        setIsLoadingMore(false);
      });
  }, []);

  return { state, loadMore, isLoadingMore, loadMoreFailed };
};

// A guess at row count, kept small so a wrong guess overshoots less;
// useDelayedSkeleton and contentFade below cover the rest.
const SKELETON_ROW_COUNT = 3;

// Mirrors a ready row (label left, figure right, rail under both) so the
// loading -> ready swap doesn't shift the layout. Decorative, so a plain div,
// not a list.
const HistorySkeleton = () => (
  <div className="divide-y divide-border">
    {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
      <div key={`history-skeleton-${index}`} className="py-3">
        <div className="flex items-baseline justify-between">
          <Skeleton className="h-4 w-24" />
          <div className="flex flex-col items-end gap-1">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <Skeleton className="mt-2 h-1 w-full" />
      </div>
    ))}
  </div>
);

// Shaped like the day view's own empty state - left-aligned under the header,
// display heading over one muted line - rather than a centred block floating
// in the middle of the screen with nothing to anchor it. The line is text-sm:
// it explains the heading, so it reads below it, not level with it.
//
// No top margin, unlike the day view's, because this is main's first child:
// its py-6 is the whole gap, and the loaded page's first row starts there too,
// so the screen doesn't jump when the first day arrives. The day view's own
// empty state keeps its mt-10 - it has the hero and macros above it.
const HistoryEmptyState = ({ today }: { today: string }) => (
  <div className="flex flex-col items-start">
    <h2 className="font-display text-xl font-semibold text-text">No days logged yet</h2>
    {/* max-w-[38ch] keeps the measure readable on a wide screen; the copy is
        one sentence, so it wraps to two lines at phone width either way. */}
    <p className="mt-2 max-w-[38ch] text-pretty text-sm text-text-muted">
      Every day you log lands here, newest first, with how it sat against your goal.
    </p>
    <Link href={`/day/${today}`} className={`${buttonClassName("ghost")} mt-6`}>
      Log something today
    </Link>
  </div>
);

// "under"/"over", not the hero's "left"/"over": a past day is finished, so
// there is nothing left in it to spend. Today is the exception and says so -
// it is not under a goal it can still cross before bed.
const GoalComparison = ({ remaining, isToday }: { remaining: CalorieRemaining; isToday: boolean }) => {
  if (remaining.status === "unset") {
    return null;
  }
  if (isToday && remaining.status === "left") {
    return <span className="text-sm text-text-muted">so far</span>;
  }
  const isOver = remaining.status === "over";
  return (
    <span className={`tabular-nums text-sm ${isOver ? "text-danger" : "text-text-muted"}`}>
      {formatNumber(remaining.kcal)} {isOver ? "over" : "under"} goal
    </span>
  );
};

// Same pair as the day hero's CalorieBar (bg-border track, bg-text fill,
// danger past the goal), one tier quieter at h-1 - this is a row in a list,
// not the headline of a screen. No accent colour: the four accents each own a
// macro, and a day's kcal is not one.
//
// role="presentation": the figure and the comparison above it already say
// everything the rail encodes. No rail at all without a goal - a bar with
// nothing to be a share of would be decoration.
const HistoryRail = ({ share, isOver }: { share: number; isOver: boolean }) => (
  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-border" role="presentation">
    <div
      className={`h-full origin-left rounded-full ${isOver ? "bg-danger" : "bg-text"}`}
      style={{ transform: `scaleX(${share})` }}
    />
  </div>
);

interface LoggedRowProps {
  date: string;
  totalKcal: number;
  calorieGoal: number | null;
  today: string;
}

// The rail and the line above it read the same comparison, so both take it
// from one call: a bar that turned red a kcal before the words did would be
// two different answers to the same question.
const LoggedRow = ({ date, totalKcal, calorieGoal, today }: LoggedRowProps) => {
  const remaining = calorieRemaining(calorieGoal, totalKcal);
  return (
    <Link href={`/day/${date}`} className={`block py-3 ${FOCUS_RING}`}>
      <span className="flex items-baseline justify-between gap-4">
        <span className="font-medium text-text">{formatDayLabel(date, today)}</span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="tabular-nums text-text-muted">{formatNumber(Math.round(totalKcal))} kcal</span>
          <GoalComparison remaining={remaining} isToday={date === today} />
        </span>
      </span>
      {calorieGoal !== null && (
        <HistoryRail share={Math.min(1, totalKcal / calorieGoal)} isOver={remaining.status === "over"} />
      )}
    </Link>
  );
};

// Muted label and no rail, so a blank day reads as blank at a glance rather
// than as a day that scored zero. Still a link: it is the way to go and fill
// it in, which is the whole reason these rows are here.
const UnloggedRow = ({ date, today }: { date: string; today: string }) => (
  <Link href={`/day/${date}`} className={`flex items-baseline justify-between gap-4 py-3 ${FOCUS_RING}`}>
    <span className="text-text-muted">{formatDayLabel(date, today)}</span>
    <span className="shrink-0 text-sm text-text-muted">Nothing logged</span>
  </Link>
);

// Not a link: it stands for many days, and picking one of them for the user
// would be guessing which.
const GapRow = ({ days }: { days: number }) => (
  <p className="flex items-baseline justify-between gap-4 py-3 text-sm text-text-muted">
    <span>Nothing logged</span>
    <span className="shrink-0 tabular-nums">{days} days</span>
  </p>
);

const HistoryRowItem = ({ row, calorieGoal, today }: { row: HistoryRow; calorieGoal: number | null; today: string }) => {
  switch (row.kind) {
    case "logged":
      return <LoggedRow date={row.date} totalKcal={row.totalKcal} calorieGoal={calorieGoal} today={today} />;
    case "unlogged":
      return <UnloggedRow date={row.date} today={today} />;
    case "gap":
      return <GapRow days={row.days} />;
  }
};

// Sticky so the month a thumb is scrolling through keeps saying which one it
// is. bg-bg, not a translucent panel: rows pass under it, and the app has no
// glass anywhere else.
const MonthSection = ({ month, calorieGoal, today }: { month: HistoryMonth; calorieGoal: number | null; today: string }) => (
  <section>
    <h2 className="sticky top-0 z-10 bg-bg py-2 text-sm font-medium tracking-wide text-text-muted">{month.label}</h2>
    <ul className="divide-y divide-border">
      {month.rows.map((row) => (
        <li key={row.date}>
          <HistoryRowItem row={row} calorieGoal={calorieGoal} today={today} />
        </li>
      ))}
    </ul>
  </section>
);

type DayTone = "blank" | "logged" | "over";

const dayTone = (kcal: number | null, calorieGoal: number | null): DayTone => {
  if (kcal === null) return "blank";
  return calorieRemaining(calorieGoal, kcal).status === "over" ? "over" : "logged";
};

// The rail pair again: bg-border is an empty track, bg-text a filled one,
// danger a day past the goal. A blank day is the track with nothing on it.
const TILE_CLASS: Record<DayTone, string> = {
  blank: "bg-border",
  logged: "bg-text",
  over: "bg-danger",
};

const countTone = (tones: DayTone[], tone: DayTone): number => tones.filter((each) => each === tone).length;

// What a sighted reader counts off the tiles, said in words for everyone else.
const tallyLabel = (tones: DayTone[], hasGoal: boolean): string => {
  const blank = `${countTone(tones, "blank")} with nothing logged`;
  if (!hasGoal) return `${countTone(tones, "logged")} logged, ${blank}`;
  return `${countTone(tones, "logged")} under goal, ${countTone(tones, "over")} over, ${blank}`;
};

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-GB", { weekday: "narrow", timeZone: "UTC" });
const weekdayInitial = (date: string): string => WEEKDAY_FORMATTER.format(new Date(`${date}T00:00:00Z`));

// Not links: the rows under it already go to each day, and a tile is too
// small a target for a thumb.
const WeekStrip = ({ days, calorieGoal }: { days: WeekDay[]; calorieGoal: number | null }) => {
  const tones = days.map((day) => dayTone(day.kcal, calorieGoal));
  return (
    <div role="img" aria-label={tallyLabel(tones, calorieGoal !== null)} className="flex gap-1">
      {days.map((day, index) => (
        <div key={day.date} className="flex flex-1 flex-col items-center gap-1.5">
          <div className={`h-2 w-full rounded-full ${TILE_CLASS[tones[index]]}`} />
          <span aria-hidden="true" className="text-xs text-text-muted">{weekdayInitial(day.date)}</span>
        </div>
      ))}
    </div>
  );
};

// How the average sat against the goal, in the rows' own words; a past week
// is finished, so it is "under", never "left".
const AverageAgainstGoal = ({ averageKcal, calorieGoal }: { averageKcal: number; calorieGoal: number | null }) => {
  const remaining = calorieRemaining(calorieGoal, averageKcal);
  if (remaining.status === "unset") return null;
  const isOver = remaining.status === "over";
  return (
    <>
      {" · "}
      <span className={`tabular-nums ${isOver ? "text-danger" : ""}`}>
        {formatNumber(remaining.kcal)} {isOver ? "over" : "under"} goal
      </span>
    </>
  );
};

// Context for the list under it, so it stays one quiet tier: a label, a strip
// of tiles and one line, no card. The week ends yesterday, for the same reason
// today's row says "so far".
const WeekSummaryBlock = ({ summary, calorieGoal }: { summary: WeekSummary; calorieGoal: number | null }) => (
  <section aria-labelledby="week-summary-heading" className="mb-2 flex flex-col gap-3">
    <div className="flex items-baseline justify-between gap-4 text-sm text-text-muted">
      <h2 id="week-summary-heading" className="font-medium tracking-wide">Last {summary.days.length} days</h2>
      <p className="tabular-nums">
        <span className="text-text">{summary.loggedDays}</span> of {summary.days.length} logged
      </p>
    </div>
    <WeekStrip days={summary.days} calorieGoal={calorieGoal} />
    <p className="text-sm text-text-muted">
      <span className="tabular-nums text-text">{formatNumber(summary.averageKcal)} kcal</span> a logged day
      <AverageAgainstGoal averageKcal={summary.averageKcal} calorieGoal={calorieGoal} />
    </p>
  </section>
);

interface HistoryReadyBodyProps {
  entries: DayHistoryEntry[];
  nextOffset: number | null;
  calorieGoal: number | null;
  today: string;
  isLoadingMore: boolean;
  loadMoreFailed: boolean;
  onLoadMore: (offset: number) => void;
}

interface LoadMoreControlProps {
  nextOffset: number;
  isLoadingMore: boolean;
  loadMoreFailed: boolean;
  onLoadMore: (offset: number) => void;
}

// The failure sits under the still-intact list rather than replacing it, so
// a retry is one tap away from where the rows already are.
const LoadMoreControl = ({ nextOffset, isLoadingMore, loadMoreFailed, onLoadMore }: LoadMoreControlProps) => (
  <div className="flex flex-col gap-2">
    {loadMoreFailed && <InlineMessage tone="error">Could not load more days. Please try again.</InlineMessage>}
    <Button variant="ghost" pending={isLoadingMore} onClick={() => onLoadMore(nextOffset)}>
      {loadMoreFailed ? "Try again" : "Load more"}
    </Button>
  </div>
);

const HistoryReadyBody = ({
  entries, nextOffset, calorieGoal, today, isLoadingMore, loadMoreFailed, onLoadMore,
}: HistoryReadyBodyProps) => {
  if (entries.length === 0) {
    return <HistoryEmptyState today={today} />;
  }
  const summary = weekSummary(entries, today, nextOffset !== null);

  return (
    <div className="flex flex-col gap-4">
      {summary && <WeekSummaryBlock summary={summary} calorieGoal={calorieGoal} />}
      {toHistoryMonths(entries, today).map((month) => (
        <MonthSection key={month.key} month={month} calorieGoal={calorieGoal} today={today} />
      ))}
      {nextOffset !== null && (
        <LoadMoreControl
          nextOffset={nextOffset}
          isLoadingMore={isLoadingMore}
          loadMoreFailed={loadMoreFailed}
          onLoadMore={onLoadMore}
        />
      )}
    </div>
  );
};

// Appending rows changes nothing a screen reader would otherwise notice -
// no focus move, no route change - so the new count is announced politely.
const historyStatusMessage = (entryCount: number, isLoadingMore: boolean): string =>
  isLoadingMore ? "Loading more days" : `${entryCount} days loaded`;

interface HistoryLoadedProps {
  firstPage: DayHistoryPage;
  today: string;
  onStatus: (message: string) => void;
}

const HistoryLoaded = ({ firstPage, today, onStatus }: HistoryLoadedProps) => {
  const { state, loadMore, isLoadingMore, loadMoreFailed } = useHistoryState(firstPage);
  const message = historyStatusMessage(state.entries.length, isLoadingMore);
  useEffect(() => onStatus(message), [message, onStatus]);

  return (
    <HistoryReadyBody
      entries={state.entries}
      nextOffset={state.nextOffset}
      calorieGoal={state.calorieGoal}
      today={today}
      isLoadingMore={isLoadingMore}
      loadMoreFailed={loadMoreFailed}
      onLoadMore={loadMore}
    />
  );
};

interface HistoryContentProps {
  load: Promise<HistoryLoad>;
  today: string;
  onStatus: (message: string) => void;
}

// Same delayed-skeleton + fade-in treatment as the day view.
const HistoryContent = ({ load, today, onStatus }: HistoryContentProps) => {
  const result = use(load);
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={contentFadeInitial(reduceMotion)}
      animate={{ opacity: 1 }}
      transition={contentFadeTransition(reduceMotion)}
    >
      {result.status === "error" ? (
        <InlineMessage tone="error">Could not load history. Please try again.</InlineMessage>
      ) : (
        <HistoryLoaded firstPage={result.page} today={today} onStatus={onStatus} />
      )}
    </motion.div>
  );
};

// LiveStatus sits outside the Suspense boundary: a live region has to exist
// before its text changes, and the list mounts only once it is read.
export const HistoryView = ({ today, load }: { today: string; load: Promise<HistoryLoad> }) => {
  const [statusMessage, setStatusMessage] = useState("");

  return (
    <>
      <AppHeader variant="back" title="History" backHref={`/day/${today}`} />
      <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-6 focus:outline-none">
        <LiveStatus message={statusMessage} />
        <Suspense fallback={<DelayedFallback><HistorySkeleton /></DelayedFallback>}>
          <HistoryContent load={load} today={today} onStatus={setStatusMessage} />
        </Suspense>
      </main>
    </>
  );
};
