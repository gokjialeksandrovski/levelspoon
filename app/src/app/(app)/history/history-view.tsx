"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { getDayHistory } from "@/features/meals/actions/meals";
import type { DayHistoryEntry, DayHistoryPage } from "@/features/meals/actions/meals";
import { calorieRemaining } from "@/features/goals/actions/goals.utils";
import type { CalorieRemaining } from "@/features/goals/actions/goals.utils";
import { AppHeader } from "@/components/layout/app-header";
import { Button, buttonClassName } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";
import { LiveStatus } from "@/components/ui/live-status";
import { Skeleton } from "@/components/ui/skeleton";
import { FOCUS_RING } from "@/components/ui/tap-target";
import { todayLocalDateString } from "@/lib/date/day-bounds";
import { formatDayLabel } from "@/lib/date/format";
import { contentFadeInitial, contentFadeTransition } from "@/lib/motion/step-transition";
import { useDelayedSkeleton } from "@/lib/motion/use-delayed-skeleton";

import { recentAverage, toHistoryMonths } from "./history.utils";
import type { HistoryMonth, HistoryRow, RecentAverage } from "./history.utils";

type HistoryState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; entries: DayHistoryEntry[]; nextOffset: number | null; calorieGoal: number | null };

const firstPage = (page: DayHistoryPage): HistoryState => ({
  status: "ready",
  entries: page.entries,
  nextOffset: page.nextOffset,
  calorieGoal: page.calorieGoal,
});

const appendPage = (previous: HistoryState, page: DayHistoryPage): HistoryState => ({
  status: "ready",
  entries: previous.status === "ready" ? [...previous.entries, ...page.entries] : page.entries,
  nextOffset: page.nextOffset,
  calorieGoal: page.calorieGoal,
});

interface UseHistoryStateResult {
  state: HistoryState;
  loadMore: (offset: number) => void;
  isLoadingMore: boolean;
  loadMoreFailed: boolean;
}

const useHistoryState = (): UseHistoryStateResult => {
  const [state, setState] = useState<HistoryState>({ status: "loading" });
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  // A ref, not isLoadingMore: two taps in the same frame both read the old
  // state value, so only a ref actually blocks the duplicate request.
  const isFetchingMore = useRef(false);

  useEffect(() => {
    getDayHistory(0)
      .then((page) => setState(firstPage(page)))
      .catch(() => setState({ status: "error" }));
  }, []);

  // Failure here keeps the rows already on screen and reports next to the
  // button: dropping to the error state would blank page 1 because page 2
  // failed. A duplicate request would append the same page twice, so it
  // costs rows, not just a wasted call.
  const loadMore = useCallback((offset: number): void => {
    if (isFetchingMore.current) return;
    isFetchingMore.current = true;
    setIsLoadingMore(true);
    setLoadMoreFailed(false);
    getDayHistory(offset)
      .then((page) => setState((previous) => appendPage(previous, page)))
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
      {remaining.kcal.toLocaleString()} {isOver ? "over" : "under"} goal
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
        <span className="font-medium text-text">{formatDayLabel(date)}</span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="tabular-nums text-text-muted">{Math.round(totalKcal).toLocaleString()} kcal</span>
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
const UnloggedRow = ({ date }: { date: string }) => (
  <Link href={`/day/${date}`} className={`flex items-baseline justify-between gap-4 py-3 ${FOCUS_RING}`}>
    <span className="text-text-muted">{formatDayLabel(date)}</span>
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
      return <UnloggedRow date={row.date} />;
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

// One line, no card and no chart: it is context for the list under it, and the
// day it would compete with is the one the user just left.
const RecentAverageLine = ({ average }: { average: RecentAverage }) => (
  <p className="text-sm text-text-muted">
    Last {average.days} logged days · <span className="tabular-nums text-text">{average.kcal.toLocaleString()} kcal</span> a day
  </p>
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
  const average = recentAverage(entries, today);

  return (
    <div className="flex flex-col gap-4">
      {average && <RecentAverageLine average={average} />}
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

interface HistoryBodyProps {
  state: HistoryState;
  today: string;
  isLoadingMore: boolean;
  loadMoreFailed: boolean;
  onLoadMore: (offset: number) => void;
}

// Appending rows changes nothing a screen reader would otherwise notice -
// no focus move, no route change - so the new count is announced politely.
const historyStatusMessage = (state: HistoryState, isLoadingMore: boolean): string => {
  if (isLoadingMore) return "Loading more days";
  if (state.status !== "ready") return "";
  return `${state.entries.length} days loaded`;
};

// Same delayed-skeleton + fade-in treatment as the day view's DayViewBody.
const HistoryBody = ({ state, today, isLoadingMore, loadMoreFailed, onLoadMore }: HistoryBodyProps) => {
  const reduceMotion = useReducedMotion();
  const showSkeleton = useDelayedSkeleton(state.status === "loading");

  if (state.status === "loading") {
    return showSkeleton ? <HistorySkeleton /> : null;
  }

  return (
    <motion.div
      initial={contentFadeInitial(reduceMotion)}
      animate={{ opacity: 1 }}
      transition={contentFadeTransition(reduceMotion)}
    >
      {state.status === "error" ? (
        <InlineMessage tone="error">Could not load history. Please try again.</InlineMessage>
      ) : (
        <HistoryReadyBody
          entries={state.entries}
          nextOffset={state.nextOffset}
          calorieGoal={state.calorieGoal}
          today={today}
          isLoadingMore={isLoadingMore}
          loadMoreFailed={loadMoreFailed}
          onLoadMore={onLoadMore}
        />
      )}
    </motion.div>
  );
};

export const HistoryView = () => {
  const { state, loadMore, isLoadingMore, loadMoreFailed } = useHistoryState();
  const today = todayLocalDateString(Intl.DateTimeFormat().resolvedOptions().timeZone);

  return (
    <>
      <AppHeader variant="back" title="History" backHref={`/day/${today}`} />
      <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-6 focus:outline-none">
        <LiveStatus message={historyStatusMessage(state, isLoadingMore)} />
        <HistoryBody
          state={state}
          today={today}
          isLoadingMore={isLoadingMore}
          loadMoreFailed={loadMoreFailed}
          onLoadMore={loadMore}
        />
      </main>
    </>
  );
};
