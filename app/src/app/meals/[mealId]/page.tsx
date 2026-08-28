// app/src/app/meals/[mealId]/page.tsx
import { notFound } from "next/navigation";

import { getMeal } from "@/actions/meals";

import { CaptureWizard } from "./capture-wizard";
import { DayTotalBar } from "./day-total-bar";

const MealPage = async ({ params }: { params: Promise<{ mealId: string }> }) => {
  const { mealId } = await params;
  const meal = await getMeal(mealId);
  if (!meal) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{meal.name}</h1>
      <DayTotalBar />
      <CaptureWizard mealId={mealId} />
    </div>
  );
};

export default MealPage;
