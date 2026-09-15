import Link from "next/link";

import type { DayMealSummary } from "@/features/meals/actions/meals";
import { FOCUS_RING } from "@/components/ui/tap-target";

const MAX_NAMES_SHOWN = 2;

export const summariseIngredients = (names: string[]): string => {
  if (names.length <= MAX_NAMES_SHOWN) return names.join(", ");
  return `${names.slice(0, MAX_NAMES_SHOWN).join(", ")}, +${names.length - MAX_NAMES_SHOWN}`;
};

// A single-ingredient log isn't a "meal" - its name becomes the heading
// directly; "Meal N" only applies once there's an actual composition.
export const mealHeading = (meal: DayMealSummary, index: number): { heading: string; subtitle: string | null } =>
  meal.ingredientNames.length === 1
    ? { heading: meal.ingredientNames[0], subtitle: null }
    : { heading: `Meal ${index + 1}`, subtitle: summariseIngredients(meal.ingredientNames) };

const MealListItem = ({ meal, index }: { meal: DayMealSummary; index: number }) => {
  const { heading, subtitle } = mealHeading(meal, index);

  return (
    <li>
      <Link href={`/meals/${meal.id}`} className={`flex items-baseline justify-between py-3 ${FOCUS_RING}`}>
        <span className="flex flex-col gap-0.5">
          <span className="font-medium text-text">{heading}</span>
          {subtitle && <span className="text-sm text-text-muted">{subtitle}</span>}
        </span>
        <span className="tabular-nums text-sm text-text-muted">{Math.round(meal.total.energyKcal)} kcal</span>
      </Link>
    </li>
  );
};

export const MealList = ({ meals }: { meals: DayMealSummary[] }) => (
  <ul className="mt-6 divide-y divide-border">
    {meals.map((meal, index) => (
      <MealListItem key={meal.id} meal={meal} index={index} />
    ))}
  </ul>
);
