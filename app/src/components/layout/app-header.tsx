"use client";

import Link from "next/link";
import { CaretLeftIcon, CaretRightIcon, CalendarBlankIcon } from "@phosphor-icons/react";

import { formatDayLabel } from "@/lib/date/format";
import { addCalendarDays } from "@/lib/date/day-bounds";
import { AccountMenu } from "@/features/auth/components/account-menu";
import {
  ICON_ROW_EDGE_PULL_LEFT,
  ICON_ROW_EDGE_PULL_RIGHT,
  ICON_TAP_TARGET_CLASS,
} from "@/components/ui/tap-target";

type AppHeaderProps =
  | { variant: "day"; date: string }
  | { variant: "back"; title: string; backHref: string }
  | { variant: "back"; title: string; onBack: () => void };

const HEADER_CLASS = "flex h-16 items-center justify-between border-b border-border px-4";

// Day label is the h1, matching BackHeader's screens-title convention.
// Edge-pull classes align the outer icons with the body content column.
const DayHeader = ({ date }: { date: string }) => (
  <header className={HEADER_CLASS}>
    <div className={`flex items-center gap-1 ${ICON_ROW_EDGE_PULL_LEFT}`}>
      <Link href={`/day/${addCalendarDays(date, -1)}`} aria-label="Previous day" className={ICON_TAP_TARGET_CLASS}>
        <CaretLeftIcon />
      </Link>
      <h1 className="text-sm font-medium">{formatDayLabel(date)}</h1>
      <Link href={`/day/${addCalendarDays(date, 1)}`} aria-label="Next day" className={ICON_TAP_TARGET_CLASS}>
        <CaretRightIcon />
      </Link>
    </div>
    <div className={`flex items-center ${ICON_ROW_EDGE_PULL_RIGHT}`}>
      <Link href="/history" aria-label="History" className={ICON_TAP_TARGET_CLASS}>
        <CalendarBlankIcon />
      </Link>
      <AccountMenu />
    </div>
  </header>
);

type BackHeaderProps = { title: string; backHref: string } | { title: string; onBack: () => void };

const BACK_CONTROL_CLASS = `${ICON_TAP_TARGET_CLASS} ${ICON_ROW_EDGE_PULL_LEFT}`;

const BackControl = (props: BackHeaderProps) =>
  "backHref" in props ? (
    <Link href={props.backHref} aria-label="Back" className={BACK_CONTROL_CLASS}>
      <CaretLeftIcon />
    </Link>
  ) : (
    <button type="button" onClick={props.onBack} aria-label="Back" className={BACK_CONTROL_CLASS}>
      <CaretLeftIcon />
    </button>
  );

const BackHeader = (props: BackHeaderProps) => (
  <header className={HEADER_CLASS}>
    <BackControl {...props} />
    <h1 className="text-sm font-medium">{props.title}</h1>
    {/* Balances BackControl's effective width (44px box, pulled 11px into the
        margin) so the centered title stays centered. */}
    <span className={`w-11 ${ICON_ROW_EDGE_PULL_RIGHT}`} aria-hidden="true" />
  </header>
);

export const AppHeader = (props: AppHeaderProps) => {
  if (props.variant === "day") {
    return <DayHeader date={props.date} />;
  }
  return <BackHeader {...props} />;
};
