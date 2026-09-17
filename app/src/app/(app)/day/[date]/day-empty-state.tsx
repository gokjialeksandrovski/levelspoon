// One worked line of the per-100g model: the label figure, the amount eaten,
// what that costs. Real numbers for rolled oats; 40 g of 389 kcal/100 g = 156.
const PerHundredExample = () => (
  <div className="flex flex-col gap-2 rounded-surface bg-surface-raised p-4 text-sm tabular-nums">
    <p className="flex justify-between gap-3">
      <span className="text-text">Rolled oats</span>
      <span className="text-text-muted">389 kcal per 100 g</span>
    </p>
    <p className="flex justify-between gap-3">
      <span className="text-text-muted">You had 40 g</span>
      <span className="font-semibold text-text">156 kcal</span>
    </p>
  </div>
);

// The first screen a new user sees, so it teaches the model instead of saying
// "nothing here". No CTA: the day view's own sticky "New meal" bar sits below.
const TodayEmptyState = () => (
  <div className="mt-10 flex flex-col gap-3">
    <h2 className="font-display text-xl font-semibold text-text">A clean page for today</h2>
    <p className="text-pretty text-text-muted">
      Each food keeps the numbers from its label, usually per 100 g or 100 ml. Tell us how much you had and we&apos;ll do the sums.
    </p>
    <PerHundredExample />
  </div>
);

// No way to log into the past, so plain text with no CTA.
const PastEmptyState = () => (
  <p className="mt-10 text-text-muted">Nothing was logged on this day.</p>
);

export const DayEmptyState = ({ isToday }: { isToday: boolean }) => (isToday ? <TodayEmptyState /> : <PastEmptyState />);
