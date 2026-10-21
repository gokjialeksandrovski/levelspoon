"use client";

import { TrashIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { deleteMeal } from "@/features/meals/actions/meals";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";

interface DeleteMealProps {
  mealId: string;
  mealDate: string;
}

interface DeleteMealCallbacks {
  router: ReturnType<typeof useRouter>;
  onBusyChange: (isBusy: boolean) => void;
  onError: (message: string | null) => void;
}

// Navigates to the meal's own local day, not necessarily today, so a delete
// reached from History returns to the day it came from. `deleted` tells that
// day to offer Undo in the meal's place.
const deleteMealAndNavigate = async (
  mealId: string,
  mealDate: string,
  callbacks: DeleteMealCallbacks,
): Promise<void> => {
  callbacks.onBusyChange(true);
  callbacks.onError(null);
  try {
    await deleteMeal(mealId);
    callbacks.router.push(`/day/${mealDate}?deleted=${mealId}`);
  } catch {
    callbacks.onError("Could not delete this meal. Please try again.");
    callbacks.onBusyChange(false);
  }
};

// No confirm step: deleting is a soft delete, and the day view offers Undo.
export const DeleteMeal = ({ mealId, mealDate }: DeleteMealProps) => {
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-2">
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
      <Button
        variant="danger"
        link
        // Full-width row, no underline: an underline marks a link inside text,
        // and this sits alone at the foot of the page like the buttons above it.
        className="w-full no-underline!"
        pending={isBusy}
        onClick={() => deleteMealAndNavigate(mealId, mealDate, { router, onBusyChange: setIsBusy, onError: setError })}
      >
        {/* Link mode wraps children in one span, where preflight's block-level svg
            would break the line - this row keeps icon and label on one line. */}
        <span className="inline-flex items-center gap-2">
          <TrashIcon size={18} />
          Delete meal
        </span>
      </Button>
    </div>
  );
};
