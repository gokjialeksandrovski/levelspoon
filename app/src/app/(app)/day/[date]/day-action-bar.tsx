// app/src/app/(app)/day/[date]/day-action-bar.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createMeal } from "@/actions/meals";
import { Button } from "@/components/button";
import { InlineMessage } from "@/components/inline-message";

// Both entry points create a meal up front and hand its id to the wizard;
// they differ only in the wizard's exit behaviour, which `?mode=quick`
// selects. An abandoned meal is discarded by the wizard on its way out.
export const DayActionBar = () => {
  const router = useRouter();
  const [hasError, setHasError] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const start = async (isQuick: boolean) => {
    setIsBusy(true);
    setHasError(false);
    try {
      const { mealId } = await createMeal();
      router.push(`/meals/${mealId}/capture${isQuick ? "?mode=quick" : ""}`);
    } catch {
      setHasError(true);
      setIsBusy(false);
    }
  };

  return (
    <div className="sticky bottom-0 border-t border-border bg-bg px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
      {hasError && <InlineMessage tone="error">Could not start. Please try again.</InlineMessage>}
      <div className="flex gap-2">
        <Button variant="primary" className="flex-1" disabled={isBusy} onClick={() => void start(true)}>
          Quick log
        </Button>
        <Button variant="ghost" className="flex-1" disabled={isBusy} onClick={() => void start(false)}>
          New meal
        </Button>
      </div>
    </div>
  );
};
