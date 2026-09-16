"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { deleteMeal } from "@/features/meals/actions/meals";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";
import { Sheet } from "@/components/ui/sheet";

interface DeleteMealProps {
  mealId: string;
  mealDate: string;
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
      <Button variant="danger" pending={isBusy} onClick={onConfirm}>
        Delete
      </Button>
    </div>
  </Sheet>
);

const DeleteMealTrigger = ({ onClick }: { onClick: () => void }) => (
  <Button variant="danger" link className="self-center" onClick={onClick}>
    Delete meal
  </Button>
);

interface DeleteMealCallbacks {
  router: ReturnType<typeof useRouter>;
  onBusyChange: (isBusy: boolean) => void;
  onError: (message: string | null) => void;
}

// Navigates to the meal's own local day, not necessarily today, so a delete
// reached from History returns to the day it came from.
const deleteMealAndNavigate = async (
  mealId: string,
  mealDate: string,
  callbacks: DeleteMealCallbacks,
): Promise<void> => {
  callbacks.onBusyChange(true);
  callbacks.onError(null);
  try {
    await deleteMeal(mealId);
    callbacks.router.push(`/day/${mealDate}`);
  } catch {
    callbacks.onError("Could not delete this meal. Please try again.");
    callbacks.onBusyChange(false);
  }
};

// Deleting is destructive and irreversible, so it always goes through a
// confirm Sheet rather than firing on the first click.
export const DeleteMeal = ({ mealId, mealDate }: DeleteMealProps) => {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <DeleteMealTrigger onClick={() => setIsOpen(true)} />
      <DeleteConfirmSheet
        isOpen={isOpen}
        isBusy={isBusy}
        error={error}
        onClose={() => setIsOpen(false)}
        onConfirm={() => deleteMealAndNavigate(mealId, mealDate, { router, onBusyChange: setIsBusy, onError: setError })}
      />
    </>
  );
};
