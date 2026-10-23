"use client";

import { CheckIcon, ExportIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import type { MealDetail } from "@/features/meals/actions/meals";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";

import { mealShareText } from "./share-meal.utils";

type ShareOutcome = "shared" | "cancelled" | "copied";

type ShareStatus = "idle" | "sharing" | "copied" | "failed";

// Long enough to read "Copied" after the tap. Judgment call, not measured.
const COPIED_LABEL_MS = 2000;

const isUserCancel = (error: unknown): boolean => error instanceof DOMException && error.name === "AbortError";

// The phone's share menu where the browser has one. A share the browser
// refuses for any reason but the user closing the menu (no share target,
// NotAllowedError) falls through to the clipboard rather than failing.
const deliverText = async (text: string): Promise<ShareOutcome> => {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (error) {
      if (isUserCancel(error)) return "cancelled";
    }
  }
  await navigator.clipboard.writeText(text);
  return "copied";
};

const statusAfter = (outcome: ShareOutcome): ShareStatus => (outcome === "copied" ? "copied" : "idle");

interface ShareMealButtonProps {
  meal: MealDetail;
  onAnnounce: (message: string) => void;
}

// Nothing to share in a meal with no ingredients.
export const ShareMealButton = ({ meal, onAnnounce }: ShareMealButtonProps) => {
  const [status, setStatus] = useState<ShareStatus>("idle");

  useEffect(() => {
    if (status !== "copied") return;
    const timer = window.setTimeout(() => setStatus("idle"), COPIED_LABEL_MS);
    return () => window.clearTimeout(timer);
  }, [status]);

  if (meal.ingredients.length === 0) {
    return null;
  }

  const share = () => {
    setStatus("sharing");
    deliverText(mealShareText(meal))
      .then((outcome) => {
        setStatus(statusAfter(outcome));
        if (outcome === "copied") onAnnounce("Meal copied.");
      })
      .catch(() => setStatus("failed"));
  };

  const isCopied = status === "copied";
  return (
    <>
      <Button variant="ghost" onClick={share} disabled={status === "sharing"}>
        {isCopied ? <CheckIcon size={20} /> : <ExportIcon size={20} />}
        {isCopied ? "Copied" : "Share meal"}
      </Button>
      {status === "failed" && <InlineMessage tone="error">Couldn&apos;t share. Try again.</InlineMessage>}
    </>
  );
};
