"use client";

import Link from "next/link";
import { CaretLeft, CaretRight, CalendarBlank } from "@phosphor-icons/react";

import { formatDayLabel } from "@/lib/date/format";
import { addCalendarDays } from "@/lib/date/day-bounds";
import { AccountMenu } from "@/app/(app)/account-menu";

type AppHeaderProps =
  | { variant: "day"; date: string }
  | { variant: "back"; title: string; backHref: string }
  | { variant: "back"; title: string; onBack: () => void };

const HEADER_CLASS = "flex h-16 items-center justify-between border-b border-border px-4";

const DayHeader = ({ date }: { date: string }) => (
  <header className={HEADER_CLASS}>
    <div className="flex items-center gap-3">
      <Link href={`/day/${addCalendarDays(date, -1)}`} aria-label="Previous day">
        <CaretLeft />
      </Link>
      <span className="text-sm font-medium">{formatDayLabel(date)}</span>
      <Link href={`/day/${addCalendarDays(date, 1)}`} aria-label="Next day">
        <CaretRight />
      </Link>
    </div>
    <div className="flex items-center gap-1">
      <Link href="/history" aria-label="History">
        <CalendarBlank />
      </Link>
      <AccountMenu />
    </div>
  </header>
);

type BackHeaderProps = { title: string; backHref: string } | { title: string; onBack: () => void };

const BackControl = (props: BackHeaderProps) =>
  "backHref" in props ? (
    <Link href={props.backHref} aria-label="Back" className="flex items-center gap-1">
      <CaretLeft />
    </Link>
  ) : (
    <button type="button" onClick={props.onBack} aria-label="Back" className="flex items-center gap-1">
      <CaretLeft />
    </button>
  );

const BackHeader = (props: BackHeaderProps) => (
  <header className={HEADER_CLASS}>
    <BackControl {...props} />
    <h1 className="text-sm font-medium">{props.title}</h1>
    <span className="w-5" aria-hidden="true" />
  </header>
);

export const AppHeader = (props: AppHeaderProps) => {
  if (props.variant === "day") {
    return <DayHeader date={props.date} />;
  }
  return <BackHeader {...props} />;
};
