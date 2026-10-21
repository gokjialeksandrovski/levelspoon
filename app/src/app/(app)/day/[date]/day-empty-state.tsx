const INTRO_POINTS = [
  {
    term: "Pick what to track",
    detail: "Calories, protein, carbs and fat are under Set goal. Weight has its own link above. You can track all of them, some, or none.",
  },
  {
    term: "Need help with the numbers?",
    detail: "If you're setting goals for the first time, or just want a second opinion, tap Set goal, then Work out the numbers. It asks a few questions and gives you a daily calorie range.",
  },
] as const;

// The first screen a new user sees, so it says what the app is for. Shows on
// every empty today, so it stays short enough to cost a returning user nothing.
// No CTA: the day view's own sticky "New meal" bar sits below.
const TodayEmptyState = () => (
  <div className="mt-10 flex flex-col gap-3">
    <h2 className="font-display text-xl font-semibold text-text">Log what you eat</h2>
    <p className="text-pretty text-text-muted">
      You can start right away. There&apos;s no setup to get through first. Tap New meal at the bottom to add your first food.
    </p>
    <dl className="mt-3 flex flex-col text-sm">
      {INTRO_POINTS.map(({ term, detail }) => (
        <div key={term} className="flex flex-col gap-1 border-t border-border py-3">
          <dt className="font-semibold text-text">{term}</dt>
          <dd className="text-pretty text-text-muted">{detail}</dd>
        </div>
      ))}
    </dl>
  </div>
);

// No CTA: the day view's own sticky bar already says which day its button
// writes to, and repeating it here would put two of them on an empty screen.
const PastEmptyState = () => (
  <p className="mt-10 text-text-muted">Nothing was logged on this day.</p>
);

export const DayEmptyState = ({ isToday }: { isToday: boolean }) => (isToday ? <TodayEmptyState /> : <PastEmptyState />);
