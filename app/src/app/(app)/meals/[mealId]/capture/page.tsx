import { notFound } from "next/navigation";

import { getDayEnergy, getMealLogDate, type DayEnergy } from "@/features/meals/actions/meals";
import { listRecipes } from "@/features/recipes/actions/recipes";
import type { RecipeSummary } from "@/features/recipes/actions/recipes.store";
import { TimezoneRefresh } from "@/components/layout/timezone-refresh";
import { todayLocalDateString } from "@/lib/date/day-bounds";
import { formatDayLabel } from "@/lib/date/format";
import { requestTimezone } from "@/lib/date/request-timezone";

import { CaptureWizard } from "./capture-wizard";

// Both reads are conveniences, so a failure degrades instead of failing the
// page: no total on the saved step, and the recipe row stays greyed, which is
// what a user with no recipes sees anyway.
const readDayEnergy = (logDate: string): Promise<DayEnergy | null> =>
  getDayEnergy(logDate).catch((error: unknown) => {
    console.error("Loading the day's total failed", error);
    return null;
  });

const readRecipes = (): Promise<RecipeSummary[]> =>
  listRecipes().catch((error: unknown) => {
    console.error("Loading recipes failed", error);
    return [];
  });

const CapturePage = async ({ params }: { params: Promise<{ mealId: string }> }) => {
  const [{ mealId }, timezone] = await Promise.all([params, requestTimezone()]);
  if (!timezone) {
    return <TimezoneRefresh />;
  }
  const recipesRead = readRecipes();
  const logDate = await getMealLogDate(mealId);
  if (!logDate) {
    notFound();
  }
  const [initialEnergy, recipes] = await Promise.all([readDayEnergy(logDate), recipesRead]);
  return (
    <CaptureWizard
      mealId={mealId}
      logDate={logDate}
      dayLabel={formatDayLabel(logDate, todayLocalDateString(timezone))}
      initialEnergy={initialEnergy}
      recipes={recipes}
    />
  );
};

export default CapturePage;
