"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createMeal } from "@/features/meals/actions/meals";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";

interface StartMealCallbacks {
  onBusyChange: (isBusy: boolean) => void;
  onError: (hasError: boolean) => void;
}

const startMeal = async (router: ReturnType<typeof useRouter>, callbacks: StartMealCallbacks): Promise<void> => {
  callbacks.onBusyChange(true);
  callbacks.onError(false);
  try {
    const { mealId } = await createMeal();
    router.push(`/meals/${mealId}/capture`);
  } catch {
    callbacks.onError(true);
    callbacks.onBusyChange(false);
  }
};

// Single entry point deliberately: a separate "Quick log" button only
// duplicated tapping Done on the first ingredient.
export const DayActionBar = () => {
  const router = useRouter();
  const [hasError, setHasError] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const callbacks: StartMealCallbacks = { onBusyChange: setIsBusy, onError: setHasError };

  return (
    <div className="sticky bottom-0 border-t border-border bg-bg px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
      {hasError && <InlineMessage tone="error">Could not start. Please try again.</InlineMessage>}
      <Button variant="primary" className="w-full" pending={isBusy} onClick={() => void startMeal(router, callbacks)}>
        New meal
      </Button>
    </div>
  );
};
