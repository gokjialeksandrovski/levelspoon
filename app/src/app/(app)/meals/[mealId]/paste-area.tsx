"use client";

import { XIcon } from "@phosphor-icons/react";
import { AnimatePresence, useReducedMotion } from "motion/react";
import * as motion from "motion/react-m";
import { useEffect, useId, useState } from "react";

import { pasteIngredients, type PasteIngredientsResult } from "@/features/meals/actions/meals";
import { AI_ESTIMATE_TAG } from "@/features/lazy-track/actions/lazy-track.utils";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";
import { LiveStatus } from "@/components/ui/live-status";
import { ICON_ROW_EDGE_PULL_RIGHT, ICON_TAP_TARGET_CLASS } from "@/components/ui/tap-target";
import { rowEnterVariants } from "@/lib/motion/step-transition";

import { quantityText } from "./amount-chips.utils";
import { useCopiedIngredients, type CopiedIngredientsStore } from "./copied-ingredients";
import {
  dropProducts,
  dropSource,
  ingredientCount,
  pasteLabel,
  toPasteItems,
  unavailableMessage,
  type CopiedIngredient,
} from "./copied-ingredients.utils";
import { displayProductName } from "./ingredient-row";

const ICON_BUTTON_CLASS = `${ICON_TAP_TARGET_CLASS} ${ICON_ROW_EDGE_PULL_RIGHT} -my-3 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent`;

// Long enough for a screen reader to finish the sentence; same judgment call
// as meal-detail.tsx's RECIPE_ANNOUNCEMENT_CLEAR_MS. Clearing it is what lets
// a repeat of the same message ("1 ingredient pasted.") be announced again.
const ANNOUNCEMENT_CLEAR_MS = 4000;

// Focus would otherwise fall to <body> with the unmounted button; the
// skip-link target exists on both screens (MealScreen, WizardShell).
const focusMain = (): void => document.getElementById("main-content")?.focus();

interface PasteOutcome {
  items: readonly CopiedIngredient[];
  copied: CopiedIngredientsStore;
  setError: (message: string) => void;
  announce: (message: string) => void;
  onPasted?: () => void;
}

const applyPasteResult = (result: PasteIngredientsResult, outcome: PasteOutcome): void => {
  switch (result.kind) {
    case "pasted":
      outcome.announce(`${ingredientCount(result.count)} pasted.`);
      outcome.onPasted?.();
      return;
    case "unavailable": {
      const remaining = dropProducts(outcome.items, result.productIds);
      outcome.copied.replace(remaining);
      outcome.setError(unavailableMessage(outcome.items.length - remaining.length, remaining.length));
      return;
    }
    case "meal_missing":
      outcome.setError("This meal no longer exists.");
      return;
    case "invalid":
      outcome.setError("Couldn't paste these amounts.");
      return;
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
};

interface UsePasteAreaResult {
  copied: CopiedIngredientsStore;
  isPasting: boolean;
  error: string | null;
  undoItems: readonly CopiedIngredient[] | null;
  announcement: string;
  paste: () => void;
  takeOff: (item: CopiedIngredient) => void;
  clear: () => void;
  undoClear: () => void;
  dismissUndo: () => void;
}

// Paste is the only action here that sends a request; ×, Clear and Undo
// rewrite the per-device list alone.
const usePasteArea = (mealId: string, onPasted?: () => void): UsePasteAreaResult => {
  const copied = useCopiedIngredients();
  const [isPasting, setIsPasting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undoItems, setUndoItems] = useState<readonly CopiedIngredient[] | null>(null);
  const [announcement, setAnnouncement] = useState("");

  // Adjusted during render, not in an effect: once the list holds items again
  // (Undo, or a copy from another tab) a stale Undo must never resurface.
  if (undoItems !== null && copied.items.length > 0) {
    setUndoItems(null);
  }

  useEffect(() => {
    if (!announcement) return;
    const timer = window.setTimeout(() => setAnnouncement(""), ANNOUNCEMENT_CLEAR_MS);
    return () => window.clearTimeout(timer);
  }, [announcement]);

  const paste = () => {
    const items = copied.items;
    setIsPasting(true);
    setError(null);
    pasteIngredients(mealId, toPasteItems(items))
      .then((result) => {
        applyPasteResult(result, { items, copied, setError, announce: setAnnouncement, onPasted });
        // Leaving the screen: Paste stays pending until it unmounts, or a tap
        // during the navigation round trip writes every row a second time.
        if (!(result.kind === "pasted" && onPasted)) setIsPasting(false);
      })
      .catch(() => {
        setError("Couldn't paste. Try again.");
        setIsPasting(false);
      });
  };

  const takeOff = (item: CopiedIngredient) => {
    copied.replace(dropSource(copied.items, item.sourceIngredientId));
    setAnnouncement(`${displayProductName(item.productName)} taken off copied list.`);
    focusMain();
  };

  const clear = () => {
    setUndoItems(copied.items);
    setError(null);
    copied.replace([]);
    setAnnouncement("Copied list cleared. Undo is in its place.");
  };

  const undoClear = () => {
    if (undoItems !== null) copied.replace(undoItems);
    setAnnouncement("Copied list put back.");
  };

  const dismissUndo = () => {
    setUndoItems(null);
    focusMain();
  };

  return { copied, isPasting, error, undoItems, announcement, paste, takeOff, clear, undoClear, dismissUndo };
};

interface CopiedItemRowProps {
  item: CopiedIngredient;
  isPasting: boolean;
  onTakeOff: () => void;
}

const CopiedItemRow = ({ item, isPasting, onTakeOff }: CopiedItemRowProps) => {
  const reduceMotion = useReducedMotion();
  const name = displayProductName(item.productName);

  return (
    <motion.li
      layout={!reduceMotion}
      variants={rowEnterVariants}
      initial="hidden"
      animate="visible"
      exit={reduceMotion ? undefined : { opacity: 0 }}
      className="flex items-center justify-between gap-3 py-3 text-sm"
    >
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3">
        <span className="truncate text-text">{name}</span>
        <span className="tabular-nums text-text-muted">
          {quantityText(item.quantity, item.quantityUnit, item.entryCount, item.entryUnit)} · {Math.round(item.energyKcal)} kcal
          {item.isAiEstimate && <span className="italic"> · {AI_ESTIMATE_TAG}</span>}
        </span>
      </span>
      <button
        type="button"
        onClick={onTakeOff}
        disabled={isPasting}
        aria-label={`Take ${name} off copied list`}
        className={ICON_BUTTON_CLASS}
      >
        <XIcon weight="regular" />
      </button>
    </motion.li>
  );
};

const CopiedList = ({ area }: { area: UsePasteAreaResult }) => {
  const headingId = useId();
  const { items } = area.copied;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-lg font-semibold">
        Copied
      </h2>
      <ul className="flex flex-col divide-y divide-border">
        <AnimatePresence mode="popLayout" initial={false}>
          {items.map((item) => (
            <CopiedItemRow key={item.sourceIngredientId} item={item} isPasting={area.isPasting} onTakeOff={() => area.takeOff(item)} />
          ))}
        </AnimatePresence>
      </ul>
      <div className="flex items-center justify-between gap-3">
        <Button pending={area.isPasting} onClick={area.paste}>
          {pasteLabel(items.length)}
        </Button>
        <Button variant="ghost" link disabled={area.isPasting} onClick={area.clear}>
          Clear
        </Button>
      </div>
    </section>
  );
};

interface ClearedNoticeProps {
  onUndo: () => void;
  onDismiss: () => void;
}

// Same shape as RemovedIngredientRow: Undo holds until the page leaves or the
// user dismisses it, no timer to race. autoFocus catches focus from the
// unmounted Clear button.
const ClearedNotice = ({ onUndo, onDismiss }: ClearedNoticeProps) => (
  <div className="flex items-center justify-between gap-3 text-sm text-text-muted">
    <span>Copied list cleared</span>
    <div className="flex shrink-0 items-center gap-1">
      <Button variant="primary" link autoFocus aria-label="Undo clearing copied list" onClick={onUndo}>
        Undo
      </Button>
      <button type="button" onClick={onDismiss} aria-label="Dismiss, copied list cleared" className={ICON_BUTTON_CLASS}>
        <XIcon weight="regular" />
      </button>
    </div>
  </div>
);

const PasteAreaBody = ({ area }: { area: UsePasteAreaResult }) => {
  if (area.copied.items.length > 0) {
    return <CopiedList area={area} />;
  }
  if (area.undoItems !== null) {
    return <ClearedNotice onUndo={area.undoClear} onDismiss={area.dismissUndo} />;
  }
  return null;
};

interface PasteAreaProps {
  mealId: string;
  onPasted?: () => void;
}

// The live region is always mounted: the capture wizard has none of its own,
// and a region must exist before its text changes. The error shows even when
// the list emptied, since an all-unavailable paste leaves nothing else to say it.
export const PasteArea = ({ mealId, onPasted }: PasteAreaProps) => {
  const area = usePasteArea(mealId, onPasted);
  const hasBody = area.copied.items.length > 0 || area.undoItems !== null;

  return (
    <>
      <LiveStatus message={area.announcement} />
      {(hasBody || area.error) && (
        <div className="flex flex-col gap-3">
          <PasteAreaBody area={area} />
          {area.error && <InlineMessage tone="error">{area.error}</InlineMessage>}
        </div>
      )}
    </>
  );
};
