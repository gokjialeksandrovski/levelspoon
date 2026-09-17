"use client";

import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createMeal } from "@/features/meals/actions/meals";
import { Button, buttonClassName } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";
import { ICON_ROW_EDGE_PULL_LEFT, ICON_ROW_EDGE_PULL_RIGHT, ICON_TAP_TARGET_CLASS } from "@/components/ui/tap-target";
import { addCalendarDays } from "@/lib/date/day-bounds";

interface StartMealCallbacks {
  onBusyChange: (isBusy: boolean) => void;
  onError: (hasError: boolean) => void;
}

const startMeal = async (router: ReturnType<typeof useRouter>, callbacks: StartMealCallbacks): Promise<void> => {
  callbacks.onBusyChange(true);
  callbacks.onError(false);
  try {
    const { mealId } = await createMeal();
    router.push(`/meals/${mealId}/capture`);
  } catch {
    callbacks.onError(true);
    callbacks.onBusyChange(false);
  }
};

// Single entry point deliberately: a separate "Quick log" button only
// duplicated tapping Done on the first ingredient.
const NewMealButton = () => {
  const router = useRouter();
  const [hasError, setHasError] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const callbacks: StartMealCallbacks = { onBusyChange: setIsBusy, onError: setHasError };

  return (
    <div className="flex flex-1 flex-col gap-2">
      {hasError && <InlineMessage tone="error">Could not start. Please try again.</InlineMessage>}
      <Button variant="primary" className="w-full" pending={isBusy} onClick={() => void startMeal(router, callbacks)}>
        New meal
      </Button>
    </div>
  );
};

// A past day has nothing to log, so the middle slot is the way back instead.
const BackToTodayLink = ({ today }: { today: string }) => (
  <Link href={`/day/${today}`} className={buttonClassName("ghost", "flex-1 text-center")}>
    Back to today
  </Link>
);

// Dimmed and inert rather than removed, so the middle slot never changes width on the day it becomes today.
const NextDayControl = ({ date, isToday }: { date: string; isToday: boolean }) =>
  isToday ? (
    <span aria-hidden="true" className={`${ICON_TAP_TARGET_CLASS} ${ICON_ROW_EDGE_PULL_RIGHT} opacity-30 hover:bg-transparent`}>
      <CaretRightIcon />
    </span>
  ) : (
    <Link href={`/day/${addCalendarDays(date, 1)}`} aria-label="Next day" className={`${ICON_TAP_TARGET_CLASS} ${ICON_ROW_EDGE_PULL_RIGHT}`}>
      <CaretRightIcon />
    </Link>
  );

interface DayActionBarProps {
  date: string;
  today: string;
}

// Day stepping sits here rather than in the header: the app is used one-handed,
// and the bottom edge is where the thumb already is for "New meal".
export const DayActionBar = ({ date, today }: DayActionBarProps) => {
  const isToday = date >= today;
  return (
    <nav
      aria-label="Days"
      className="sticky bottom-0 flex items-end gap-2 border-t border-border bg-bg px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3"
    >
      <Link href={`/day/${addCalendarDays(date, -1)}`} aria-label="Previous day" className={`${ICON_TAP_TARGET_CLASS} ${ICON_ROW_EDGE_PULL_LEFT}`}>
        <CaretLeftIcon />
      </Link>
      {isToday ? <NewMealButton /> : <BackToTodayLink today={today} />}
      <NextDayControl date={date} isToday={isToday} />
    </nav>
  );
};
