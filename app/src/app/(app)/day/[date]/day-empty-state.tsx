// app/src/app/(app)/day/[date]/day-empty-state.tsx
import { ForkKnifeIcon } from "@phosphor-icons/react";

// No call to action of its own: /meals/new is gone, and the day view's own
// sticky action bar (New meal) sits directly below this on today, so a
// second button here would only compete with it.
const TodayEmptyState = () => (
  <div className="mt-16 flex flex-col items-center gap-4 text-center">
    <ForkKnifeIcon size={32} weight="light" className="text-text-muted" />
    <p className="text-text-muted">Nothing logged yet</p>
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
