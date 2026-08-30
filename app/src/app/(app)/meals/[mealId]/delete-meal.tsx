// app/src/app/meals/[mealId]/delete-meal.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { deleteMeal } from "@/actions/meals";
import { Button } from "@/components/button";
import { InlineMessage } from "@/components/inline-message";
import { Sheet } from "@/components/sheet";

interface DeleteMealProps {
  mealId: string;
  today: string;
}

interface DeleteConfirmSheetProps {
  isOpen: boolean;
  isBusy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

const DeleteConfirmSheet = ({ isOpen, isBusy, error, onClose, onConfirm }: DeleteConfirmSheetProps) => (
  <Sheet open={isOpen} onClose={onClose} title="Delete this meal?">
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-muted">
        This removes the meal and all of its ingredients. This can&apos;t be undone.
      </p>
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
      <Button variant="danger" disabled={isBusy} onClick={onConfirm}>
        Delete
      </Button>
    </div>
  </Sheet>
);

interface DeleteMealCallbacks {
  router: ReturnType<typeof useRouter>;
  onBusyChange: (isBusy: boolean) => void;
  onError: (message: string | null) => void;
}

// A failed delete keeps the sheet open with an inline error instead of
// silently doing nothing or navigating away from an intact meal (rule 18 /
// rule 10).
const deleteMealAndNavigate = async (mealId: string, today: string, callbacks: DeleteMealCallbacks): Promise<void> => {
  callbacks.onBusyChange(true);
  callbacks.onError(null);
  try {
    await deleteMeal(mealId);
    callbacks.router.push(`/day/${today}`);
  } catch {
    callbacks.onError("Could not delete this meal. Please try again.");
    callbacks.onBusyChange(false);
  }
};

// Deleting is destructive and irreversible, so it always goes through a
// confirm Sheet rather than firing on the first click.
export const DeleteMeal = ({ mealId, today }: DeleteMealProps) => {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const callbacks: DeleteMealCallbacks = { router, onBusyChange: setIsBusy, onError: setError };

  return (
    <>
      <Button variant="danger" onClick={() => setIsOpen(true)}>
        Delete meal
      </Button>
      <DeleteConfirmSheet
        isOpen={isOpen}
        isBusy={isBusy}
        error={error}
        onClose={() => setIsOpen(false)}
        onConfirm={() => deleteMealAndNavigate(mealId, today, callbacks)}
      />
    </>
  );
};
