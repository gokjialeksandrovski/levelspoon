// app/src/app/(app)/day/[date]/day-empty-state.tsx
import { ForkKnife } from "@phosphor-icons/react";
import Link from "next/link";

import { buttonClassName } from "@/components/button";

// Points at /meals/new - the entry point Task 10 replaces with the capture
// wizard's action bar. Keep this functional until that task deletes the
// route; this task only restyles it.
const TodayEmptyState = () => (
  <div className="mt-16 flex flex-col items-center gap-4 text-center">
    <ForkKnife size={32} weight="light" className="text-text-muted" />
    <p className="text-text-muted">Nothing logged yet</p>
    <Link href="/meals/new" className={buttonClassName()}>
      Start a meal
    </Link>
  </div>
);

// A past day has no logging affordance - there is no way to log into the
// past, so this is plain text with no call to action.
const PastEmptyState = () => (
  <div className="mt-16 flex flex-col items-center gap-4 text-center">
    <p className="text-text-muted">No meals logged</p>
  </div>
);

export const DayEmptyState = ({ isToday }: { isToday: boolean }) => (isToday ? <TodayEmptyState /> : <PastEmptyState />);
