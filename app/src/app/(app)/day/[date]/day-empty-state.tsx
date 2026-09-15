import { ForkKnifeIcon } from "@phosphor-icons/react";

// No CTA here: the day view's own sticky "New meal" bar sits directly below.
const TodayEmptyState = () => (
  <div className="mt-16 flex flex-col items-center gap-4 text-center">
    <ForkKnifeIcon size={32} weight="light" className="text-text-muted" />
    <p className="text-text-muted">Nothing logged yet</p>
  </div>
);

// No way to log into the past, so plain text with no CTA.
const PastEmptyState = () => (
  <div className="mt-16 flex flex-col items-center gap-4 text-center">
    <p className="text-text-muted">No meals logged</p>
  </div>
);

export const DayEmptyState = ({ isToday }: { isToday: boolean }) => (isToday ? <TodayEmptyState /> : <PastEmptyState />);
