"use client";

import Link from "next/link";
import { CaretLeftIcon, CalendarBlankIcon } from "@phosphor-icons/react";

import { formatDayLabel } from "@/lib/date/format";
import { AccountMenu } from "@/features/auth/components/account-menu";
import { InstallAppButton } from "@/components/layout/install-app-button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import {
  FOCUS_RING,
  ICON_ROW_EDGE_PULL_LEFT,
  ICON_ROW_EDGE_PULL_RIGHT,
  ICON_TAP_TARGET_CLASS,
} from "@/components/ui/tap-target";

type AppHeaderProps =
  | { variant: "day"; date: string; today: string }
  | { variant: "back"; title: string; backHref: string }
  | { variant: "back"; title: string; onBack: () => void };

const HEADER_CLASS = "flex h-16 items-center justify-between border-b border-border px-4";

interface DayLabelProps {
  date: string;
  // Server-computed from the timezone cookie: reading the browser zone here
  // would render a different element on the server than on hydration.
  today: string;
}

// Away from today the label is the way back. The visible text leads the accessible name (WCAG 2.5.3).
const DayLabel = ({ date, today }: DayLabelProps) => {
  const label = formatDayLabel(date, today);
  if (date >= today) return label;
  return (
    <Link href={`/day/${today}`} className={`flex min-h-11 items-center underline decoration-border decoration-2 underline-offset-4 ${FOCUS_RING}`}>
      {label}
      <span className="sr-only">(go to today)</span>
    </Link>
  );
};

// -space-x-2: the icons' own 44px tap targets already pad them well apart
// from their glyphs; this pulls the boxes closer so the row reads as one
// tight cluster instead of separate stops.
const HeaderActions = () => (
  <div className={`flex items-center -space-x-2 ${ICON_ROW_EDGE_PULL_RIGHT}`}>
    <Link href="/history" aria-label="History" className={ICON_TAP_TARGET_CLASS}>
      <CalendarBlankIcon />
    </Link>
    <InstallAppButton />
    <ThemeToggle />
    <AccountMenu />
  </div>
);

// Day label is the h1, matching BackHeader's screens-title convention. The
// prev/next arrows live in the day view's bottom bar, within thumb reach.
const DayHeader = ({ date, today }: DayLabelProps) => (
  <header className={HEADER_CLASS}>
    <h1 className="whitespace-nowrap font-display text-xl font-semibold">
      <DayLabel date={date} today={today} />
    </h1>
    <HeaderActions />
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
    <h1 className="font-display text-xl font-semibold">{props.title}</h1>
    {/* Balances BackControl's effective width (44px box, pulled 11px into the
        margin) so the centered title stays centered. */}
    <span className={`w-11 ${ICON_ROW_EDGE_PULL_RIGHT}`} aria-hidden="true" />
  </header>
);

export const AppHeader = (props: AppHeaderProps) => {
  if (props.variant === "day") {
    return <DayHeader date={props.date} today={props.today} />;
  }
  return <BackHeader {...props} />;
};
