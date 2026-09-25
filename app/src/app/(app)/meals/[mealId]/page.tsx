import { ESTIMATE_PARAM } from "@/features/lazy-track/actions/lazy-track.utils";

import { MealDetail } from "./meal-detail";

interface MealPageProps {
  params: Promise<{ mealId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const MealPage = async ({ params, searchParams }: MealPageProps) => {
  const { mealId } = await params;
  const estimate = (await searchParams)[ESTIMATE_PARAM];
  return <MealDetail mealId={mealId} estimateDescription={typeof estimate === "string" ? estimate : null} />;
};

export default MealPage;
