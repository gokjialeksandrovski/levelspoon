// app/src/app/(app)/history/page.tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { getDayHistory } from "@/actions/meals";
import type { DayHistoryEntry } from "@/actions/meals";
import { AppHeader } from "@/components/app-header";
import { todayLocalDateString } from "@/lib/date/day-bounds";

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

const HistoryEntryRow = ({ entry }: { entry: DayHistoryEntry }) => (
  <li>
    <Link href={`/day/${entry.date}`} className="flex justify-between rounded border p-3 hover:bg-gray-50">
      <span>{entry.date}</span>
      <span>{Math.round(entry.totalKcal)} kcal</span>
    </Link>
  </li>
);

const HistoryEntryList = ({ entries }: { entries: DayHistoryEntry[] }) => (
  <ul className="flex flex-col gap-2">
    {entries.map((entry) => (
      <HistoryEntryRow key={entry.date} entry={entry} />
    ))}
  </ul>
);

interface LoadMoreButtonProps {
  nextOffset: number | null;
  onLoadMore: (offset: number) => void;
}

const LoadMoreButton = ({ nextOffset, onLoadMore }: LoadMoreButtonProps) =>
  nextOffset !== null && (
    <button type="button" onClick={() => onLoadMore(nextOffset)} className="rounded border px-4 py-2">
      Load more
    </button>
  );

const HistoryBody = ({ state, onLoadMore }: { state: HistoryState; onLoadMore: (offset: number) => void }) => {
  if (state.status === "loading") {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }
  if (state.status === "error") {
    return <p className="text-sm text-red-600">Could not load history. Please try again.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <HistoryEntryList entries={state.entries} />
      <LoadMoreButton nextOffset={state.nextOffset} onLoadMore={onLoadMore} />
    </div>
  );
};

const HistoryPage = () => {
  const { state, loadPage } = useHistoryState();
  const today = todayLocalDateString(Intl.DateTimeFormat().resolvedOptions().timeZone);

  return (
    <>
      <AppHeader variant="back" title="History" backHref={`/day/${today}`} />
      <HistoryBody state={state} onLoadMore={(offset) => loadPage(offset, true)} />
    </>
  );
};

export default HistoryPage;
