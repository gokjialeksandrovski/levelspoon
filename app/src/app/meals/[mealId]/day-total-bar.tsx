// app/src/app/meals/[mealId]/day-total-bar.tsx
import { getTodayTotal } from "@/actions/meals";

export const DayTotalBar = async () => {
  const total = await getTodayTotal();
  return (
    <div className="rounded border bg-gray-50 p-3 text-sm">
      <span className="font-medium">Today: </span>
      {Math.round(total.energyKcal)} kcal · {total.proteinG.toFixed(1)}g protein ·{" "}
      {total.carbohydrateG.toFixed(1)}g carbs · {total.fatG.toFixed(1)}g fat
    </div>
  );
};
