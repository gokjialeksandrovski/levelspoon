// app/src/app/meals/[mealId]/page.tsx
import { MealDetail } from "./meal-detail";

const MealPage = async ({ params }: { params: Promise<{ mealId: string }> }) => {
  const { mealId } = await params;
  return <MealDetail mealId={mealId} />;
};

export default MealPage;
