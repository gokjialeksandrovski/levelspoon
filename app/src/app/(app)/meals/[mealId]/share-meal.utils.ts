import type { MealDetail, MealIngredientDetail } from "@/features/meals/actions/meals";
import { withAiEstimateTag } from "@/features/lazy-track/actions/lazy-track.utils";
import { formatCalendarDate } from "@/lib/date/format";
import { formatNumber } from "@/lib/nutrition/format-number";

import { quantityText } from "./amount-chips.utils";

const kcalText = (energyKcal: number): string => `${formatNumber(Math.round(energyKcal))} kcal`;

// Same amount and kcal wording as the ingredient row on screen.
const ingredientLine = (ingredient: MealIngredientDetail): string => {
  const name = withAiEstimateTag(ingredient.productName, ingredient.isAiEstimate);
  const amount = quantityText(ingredient.quantity, ingredient.quantityUnit, ingredient.entryCount, ingredient.entryUnit);
  return `${name} — ${amount} · ${kcalText(ingredient.contribution.energyKcal)}`;
};

const totalLine = ({ total }: MealDetail): string =>
  `Total ${kcalText(total.energyKcal)} · P ${Math.round(total.proteinG)}g · C ${Math.round(total.carbohydrateG)}g · F ${Math.round(total.fatG)}g`;

/**
 * The plain text a meal is shared as, readable by someone without the app.
 * Carries only the food: no goal or day remaining, which would tell the
 * reader the sharer's target.
 */
export const mealShareText = (meal: MealDetail): string => {
  const title = meal.recipe?.name ?? `Meal ${meal.mealNumber}`;
  return [`${title} · ${formatCalendarDate(meal.date)}`, ...meal.ingredients.map(ingredientLine), "", totalLine(meal)].join("\n");
};
