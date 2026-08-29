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
      <CaptureWizard mealId={mealId} />
    </div>
  );
};

export default MealPage;
