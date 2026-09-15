// app/src/app/(app)/day/[date]/day-action-bar.tsx
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

// Was two entry points (Quick log / New meal) differing only in whether the
// wizard's post-save screen was skipped. That made "Quick log" redundant
// with just tapping Done on the first ingredient - one fewer decision to
// make up front, at the cost of one tap saved, for a choice most people
// couldn't reliably predict before starting anyway (found via /critique on
// a live screenshot, 2026-09-06; the "keep two paths or one" call is the
// user's own). Collapsed to a single entry point.
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
