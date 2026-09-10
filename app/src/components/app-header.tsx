"use client";

import Link from "next/link";
import { CaretLeft, CaretRight, CalendarBlank } from "@phosphor-icons/react";

import { formatDayLabel } from "@/lib/date/format";
import { addCalendarDays } from "@/lib/date/day-bounds";
import { AccountMenu } from "@/app/(app)/account-menu";
import { ICON_TAP_TARGET_CLASS } from "@/components/tap-target";

type AppHeaderProps =
  | { variant: "day"; date: string }
  | { variant: "back"; title: string; backHref: string }
  | { variant: "back"; title: string; onBack: () => void };

const HEADER_CLASS = "flex h-16 items-center justify-between border-b border-border px-4";

const DayHeader = ({ date }: { date: string }) => (
  <header className={HEADER_CLASS}>
    <div className="flex items-center gap-1">
      <Link href={`/day/${addCalendarDays(date, -1)}`} aria-label="Previous day" className={ICON_TAP_TARGET_CLASS}>
        <CaretLeft />
      </Link>
      <span className="text-sm font-medium">{formatDayLabel(date)}</span>
      <Link href={`/day/${addCalendarDays(date, 1)}`} aria-label="Next day" className={ICON_TAP_TARGET_CLASS}>
        <CaretRight />
      </Link>
    </div>
    <div className="flex items-center">
      <Link href="/history" aria-label="History" className={ICON_TAP_TARGET_CLASS}>
        <CalendarBlank />
      </Link>
      <AccountMenu />
    </div>
  </header>
);

type BackHeaderProps = { title: string; backHref: string } | { title: string; onBack: () => void };

const BackControl = (props: BackHeaderProps) =>
  "backHref" in props ? (
    <Link href={props.backHref} aria-label="Back" className={ICON_TAP_TARGET_CLASS}>
      <CaretLeft />
    </Link>
  ) : (
    <button type="button" onClick={props.onBack} aria-label="Back" className={ICON_TAP_TARGET_CLASS}>
      <CaretLeft />
    </button>
  );

const BackHeader = (props: BackHeaderProps) => (
  <header className={HEADER_CLASS}>
    <BackControl {...props} />
    <h1 className="text-sm font-medium">{props.title}</h1>
    {/* Balances BackControl's now-44px width (ICON_TAP_TARGET_CLASS) so the
        title stays centered - was w-5 to match the bare 22px icon before
        that fix widened the control (ui-ux-pro-max review, 2026-09-10). */}
    <span className="w-11" aria-hidden="true" />
  </header>
);

export const AppHeader = (props: AppHeaderProps) => {
  if (props.variant === "day") {
    return <DayHeader date={props.date} />;
  }
  return <BackHeader {...props} />;
};
