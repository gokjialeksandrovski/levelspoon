"use client";

import type { StandardFood } from "@/features/products/actions/products";
import { Button } from "@/components/ui/button";
import { StandardFoodPicker, useStandardFoodPicker } from "../../standard-food-picker";

import type { PathAction } from "../capture-wizard.path";
import { toSelectedProduct } from "../capture-wizard.types";

interface StandardFoodSearchStepProps {
  dispatch: (action: PathAction) => void;
}

// Cooking fats/oils get their own "fat"-category affordance on meal-detail,
// so this filters to "whole" to keep the two pick lists from overlapping.
const WHOLE_FOOD_CATEGORY = "whole" as const;
const SEARCH_ERROR = "Could not search whole foods. Please try again.";

const EmptyWholeFoodAction = ({ dispatch }: { dispatch: (action: PathAction) => void }) => (
  <Button variant="ghost" link onClick={() => dispatch({ type: "BACK" })}>
    Back to product photo
  </Button>
);

export const StandardFoodSearchStep = ({ dispatch }: StandardFoodSearchStepProps) => {
  const picker = useStandardFoodPicker(WHOLE_FOOD_CATEGORY, SEARCH_ERROR);
  const choose = (food: StandardFood) => dispatch({ type: "WHOLE_FOOD_CHOSEN", product: toSelectedProduct(food) });

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Search whole foods</h2>
      <StandardFoodPicker
        fieldName="standard-food-query"
        picker={picker}
        emptyMessage="No match. If it is packaged, photograph the label."
        emptyAction={<EmptyWholeFoodAction dispatch={dispatch} />}
        onChoose={choose}
      />
    </div>
  );
};
