"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { getDayHistory } from "@/features/meals/actions/meals";
import type { DayHistoryEntry, DayHistoryPage } from "@/features/meals/actions/meals";
import { calorieRemaining } from "@/features/goals/actions/goals.utils";
import type { CalorieRemaining } from "@/features/goals/actions/goals.utils";
import { AppHeader } from "@/components/layout/app-header";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";
import { LiveStatus } from "@/components/ui/live-status";
import { Skeleton } from "@/components/ui/skeleton";
import { FOCUS_RING } from "@/components/ui/tap-target";
import { todayLocalDateString } from "@/lib/date/day-bounds";
import { formatDayLabel } from "@/lib/date/format";
import { contentFadeInitial, contentFadeTransition } from "@/lib/motion/step-transition";
import { useDelayedSkeleton } from "@/lib/motion/use-delayed-skeleton";

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

const currentTimezone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

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
    getDayHistory(currentTimezone(), 0)
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
    getDayHistory(currentTimezone(), offset)
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

// Mirrors a ready row (label left, figure right) so the loading -> ready
// swap doesn't shift the layout. Decorative, so a plain div, not a list.
const HistorySkeleton = () => (
  <div className="divide-y divide-border">
    {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
      <div key={`history-skeleton-${index}`} className="flex items-baseline justify-between py-3">
        <Skeleton className="h-4 w-24" />
        <div className="flex flex-col items-end gap-1">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    ))}
  </div>
);

// No way to log into the past from here, so plain text with no CTA.
const HistoryEmptyState = () => (
  <div className="mt-16 flex flex-col items-center gap-4 text-center">
    <p className="text-text-muted">No history yet</p>
  </div>
);

// "under"/"over", not the hero's "left"/"over": a past day is finished, so
// there is nothing left in it to spend.
const GoalComparison = ({ remaining }: { remaining: CalorieRemaining }) => {
  if (remaining.status === "unset") {
    return null;
  }
  const isOver = remaining.status === "over";
  return (
    <span className={`tabular-nums text-sm ${isOver ? "text-danger" : "text-text-muted"}`}>
      {remaining.kcal.toLocaleString()} {isOver ? "over" : "under"} goal
    </span>
  );
};

const HistoryEntryRow = ({ entry, calorieGoal }: { entry: DayHistoryEntry; calorieGoal: number | null }) => (
  <li>
    <Link href={`/day/${entry.date}`} className={`flex items-baseline justify-between gap-4 py-3 ${FOCUS_RING}`}>
      <span>{formatDayLabel(entry.date)}</span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="tabular-nums text-text-muted">{Math.round(entry.totalKcal)} kcal</span>
        <GoalComparison remaining={calorieRemaining(calorieGoal, entry.totalKcal)} />
      </span>
    </Link>
  </li>
);

const HistoryEntryList = ({ entries, calorieGoal }: { entries: DayHistoryEntry[]; calorieGoal: number | null }) => (
  <ul className="divide-y divide-border">
    {entries.map((entry) => (
      <HistoryEntryRow key={entry.date} entry={entry} calorieGoal={calorieGoal} />
    ))}
  </ul>
);

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

interface HistoryReadyBodyProps {
  entries: DayHistoryEntry[];
  nextOffset: number | null;
  calorieGoal: number | null;
  isLoadingMore: boolean;
  loadMoreFailed: boolean;
  onLoadMore: (offset: number) => void;
}

const HistoryReadyBody = ({
  entries, nextOffset, calorieGoal, isLoadingMore, loadMoreFailed, onLoadMore,
}: HistoryReadyBodyProps) => {
  if (entries.length === 0) {
    return <HistoryEmptyState />;
  }

  return (
    <div className="flex flex-col gap-4">
      <HistoryEntryList entries={entries} calorieGoal={calorieGoal} />
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
const HistoryBody = ({ state, isLoadingMore, loadMoreFailed, onLoadMore }: HistoryBodyProps) => {
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
          isLoadingMore={isLoadingMore}
          loadMoreFailed={loadMoreFailed}
          onLoadMore={onLoadMore}
        />
      )}
    </motion.div>
  );
};

const HistoryPage = () => {
  const { state, loadMore, isLoadingMore, loadMoreFailed } = useHistoryState();
  const today = todayLocalDateString(Intl.DateTimeFormat().resolvedOptions().timeZone);

  return (
    <>
      <AppHeader variant="back" title="History" backHref={`/day/${today}`} />
      <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-6 focus:outline-none">
        <LiveStatus message={historyStatusMessage(state, isLoadingMore)} />
        <HistoryBody
          state={state}
          isLoadingMore={isLoadingMore}
          loadMoreFailed={loadMoreFailed}
          onLoadMore={loadMore}
        />
      </main>
    </>
  );
};

export default HistoryPage;
