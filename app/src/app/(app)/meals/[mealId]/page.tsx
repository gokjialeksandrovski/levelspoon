import { getMealDetail } from "@/features/meals/actions/meals";

import { MealDetail, type MealLoad } from "./meal-detail";

const loadMeal = (mealId: string): Promise<MealLoad> =>
  getMealDetail(mealId).then(
    (meal): MealLoad => (meal ? { status: "ready", meal } : { status: "not-found" }),
    (error: unknown): MealLoad => {
      console.error("Loading the meal failed", mealId, error);
      return { status: "error" };
    },
  );

// Not awaited: the header and skeleton render now and MealDetail suspends on
// the read.
const MealPage = async ({ params }: { params: Promise<{ mealId: string }> }) => {
  const { mealId } = await params;
  return <MealDetail mealId={mealId} load={loadMeal(mealId)} />;
};

export default MealPage;
