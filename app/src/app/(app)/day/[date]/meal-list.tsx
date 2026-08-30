// app/src/app/(app)/day/[date]/meal-list.tsx
import Link from "next/link";

import type { DayMealSummary } from "@/actions/meals";

const MAX_NAMES_SHOWN = 2;

// Moved here from day-view.tsx (Task 4 origin) - only meal-list.tsx renders
// ingredient summaries, so it belongs colocated with that render rather than
// in the day view's own module (rule 19, colocation).
export const summariseIngredients = (names: string[]): string => {
  if (names.length <= MAX_NAMES_SHOWN) return names.join(", ");
  return `${names.slice(0, MAX_NAMES_SHOWN).join(", ")}, +${names.length - MAX_NAMES_SHOWN}`;
};

const MealListItem = ({ meal, index }: { meal: DayMealSummary; index: number }) => (
  <li>
    <Link href={`/meals/${meal.id}`} className="flex items-baseline justify-between py-3">
      <span className="flex flex-col gap-0.5">
        <span className="font-medium text-text">Meal {index + 1}</span>
        <span className="text-sm text-text-muted">{summariseIngredients(meal.ingredientNames)}</span>
      </span>
      <span className="tabular-nums text-sm text-text-muted">{Math.round(meal.total.energyKcal)} kcal</span>
    </Link>
  </li>
);

export const MealList = ({ meals }: { meals: DayMealSummary[] }) => (
  <ul className="mt-6 divide-y divide-border">
    {meals.map((meal, index) => (
      <MealListItem key={meal.id} meal={meal} index={index} />
    ))}
  </ul>
);
