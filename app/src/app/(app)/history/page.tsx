// app/src/app/(app)/history/page.tsx
"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { getDayHistory } from "@/features/meals/actions/meals";
import type { DayHistoryEntry } from "@/features/meals/actions/meals";
import { AppHeader } from "@/components/layout/app-header";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";
import { Skeleton } from "@/components/ui/skeleton";
import { FOCUS_RING } from "@/components/ui/tap-target";
import { todayLocalDateString } from "@/lib/date/day-bounds";
import { formatDayLabel } from "@/lib/date/format";
import { contentFadeInitial, contentFadeTransition } from "@/lib/motion/step-transition";
import { useDelayedSkeleton } from "@/lib/motion/use-delayed-skeleton";

type HistoryState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; entries: DayHistoryEntry[]; nextOffset: number | null };

const appendPage = (
  previous: HistoryState,
  page: { entries: DayHistoryEntry[]; nextOffset: number | null },
  append: boolean,
): HistoryState => ({
  status: "ready",
  entries: append && previous.status === "ready" ? [...previous.entries, ...page.entries] : page.entries,
  nextOffset: page.nextOffset,
});

interface UseHistoryStateResult {
  state: HistoryState;
  loadPage: (offset: number, append: boolean) => void;
}

const useHistoryState = (): UseHistoryStateResult => {
  const [state, setState] = useState<HistoryState>({ status: "loading" });

  const loadPage = useCallback((offset: number, append: boolean) => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    getDayHistory(timezone, offset)
      .then((page) => setState((previous) => appendPage(previous, page, append)))
      .catch(() => setState({ status: "error" }));
  }, []);

  useEffect(() => {
    loadPage(0, false);
  }, [loadPage]);

  return { state, loadPage };
};

// A guess at how many rows a real history has, same class of problem as the
// day view's old fixed-3-meals skeleton (day-view.tsx): whatever this
// number is, it's usually wrong, and the swap to real content used to
// collapse (or grow) the instant it resolved. Kept small on purpose so a
// wrong guess overshoots by less; useDelayedSkeleton and the contentFade
// below (2026-09-09) do the rest of the work.
const SKELETON_ROW_COUNT = 3;

// Mirrors a ready row (label left, figure right) so the loading -> ready
// swap doesn't shift the layout. Decorative, so a plain div, not a list.
const HistorySkeleton = () => (
  <div className="divide-y divide-border">
    {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
      <div key={`history-skeleton-${index}`} className="flex items-center justify-between py-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16" />
      </div>
    ))}
  </div>
);

// A fresh account reaches /history with nothing logged - plain, calm text,
// no call to action (there is no way to log into the past from here).
const HistoryEmptyState = () => (
  <div className="mt-16 flex flex-col items-center gap-4 text-center">
    <p className="text-text-muted">No history yet</p>
  </div>
);

const HistoryEntryRow = ({ entry }: { entry: DayHistoryEntry }) => (
  <li>
    <Link href={`/day/${entry.date}`} className={`flex items-baseline justify-between py-3 ${FOCUS_RING}`}>
      <span>{formatDayLabel(entry.date)}</span>
      <span className="tabular-nums text-text-muted">{Math.round(entry.totalKcal)} kcal</span>
    </Link>
  </li>
);

const HistoryEntryList = ({ entries }: { entries: DayHistoryEntry[] }) => (
  <ul className="divide-y divide-border">
    {entries.map((entry) => (
      <HistoryEntryRow key={entry.date} entry={entry} />
    ))}
  </ul>
);

interface HistoryReadyBodyProps {
  entries: DayHistoryEntry[];
  nextOffset: number | null;
  onLoadMore: (offset: number) => void;
}

const HistoryReadyBody = ({ entries, nextOffset, onLoadMore }: HistoryReadyBodyProps) => {
  if (entries.length === 0) {
    return <HistoryEmptyState />;
  }

  return (
    <div className="flex flex-col gap-4">
      <HistoryEntryList entries={entries} />
      {nextOffset !== null && (
        <Button variant="ghost" onClick={() => onLoadMore(nextOffset)}>
          Load more
        </Button>
      )}
    </div>
  );
};

// Same delayed-skeleton + fade-in treatment as the day view's DayViewBody:
// skip the placeholder entirely for fast loads, and fade resolved content in
// rather than snapping it into place once it does show (2026-09-09).
const HistoryBody = ({ state, onLoadMore }: { state: HistoryState; onLoadMore: (offset: number) => void }) => {
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
        <HistoryReadyBody entries={state.entries} nextOffset={state.nextOffset} onLoadMore={onLoadMore} />
      )}
    </motion.div>
  );
};

const HistoryPage = () => {
  const { state, loadPage } = useHistoryState();
  const today = todayLocalDateString(Intl.DateTimeFormat().resolvedOptions().timeZone);

  return (
    <>
      <AppHeader variant="back" title="History" backHref={`/day/${today}`} />
      <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-6 focus:outline-none">
        <HistoryBody state={state} onLoadMore={(offset) => loadPage(offset, true)} />
      </main>
    </>
  );
};

export default HistoryPage;
