// app/src/app/meals/[mealId]/page.tsx
import { notFound } from "next/navigation";

import { getMealDetail, type MealIngredientDetail } from "@/actions/meals";

import { AddIngredientSection } from "./add-ingredient-section";
import { DayTotalBar } from "./day-total-bar";
import { IngredientRow } from "./ingredient-row";

const IngredientList = ({ ingredients }: { ingredients: MealIngredientDetail[] }) => (
  <ul className="flex flex-col gap-2">
    {ingredients.map((ingredient) => (
      <IngredientRow key={ingredient.id} ingredient={ingredient} />
    ))}
  </ul>
);

const MealTotal = ({ energyKcal }: { energyKcal: number }) => (
  <div className="rounded border bg-gray-50 p-3 text-sm">
    <span className="font-medium">Meal total: </span>
    {Math.round(energyKcal)} kcal
  </div>
);

const MealPage = async ({ params }: { params: Promise<{ mealId: string }> }) => {
  const { mealId } = await params;
  const meal = await getMealDetail(mealId);
  if (!meal) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{meal.name}</h1>
      {/*
        MealPage re-executes on every router.refresh() (called by the capture
        wizard after a save); a fresh key each render forces React to remount
        DayTotalBar rather than preserve its stale mount-only fetch effect -
        this is what makes the total live-update after saving an ingredient,
        matching the old async-server-component's implicit always-refetch
        behavior.
      */}
      {/* eslint-disable-next-line react-hooks/purity -- Date.now() here is deliberate, not a purity bug: MealPage is a Server Component that executes once per server request/refresh (no client-side re-render or double-invoke to make unstable), so a fresh value per execution is exactly the intended per-request behavior. */}
      <DayTotalBar key={Date.now()} />
      {meal.ingredients.length > 0 && <IngredientList ingredients={meal.ingredients} />}
      {meal.ingredients.length > 0 && <MealTotal energyKcal={meal.total.energyKcal} />}
      <AddIngredientSection mealId={mealId} />
    </div>
  );
};

export default MealPage;
