"use client";

import { useEffect, useId, useState, type ReactNode } from "react";

import { recentAmounts, type RecentAmount } from "@/features/meals/actions/meals";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDelayedSkeleton } from "@/lib/motion/use-delayed-skeleton";

import { chipLabel, isChipSelected, type AmountChip, type ChipSource } from "./amount-chips.utils";

interface RecentAmountsState {
  recents: RecentAmount[];
  isLoading: boolean;
}

/**
 * How this user last logged this product, for the chip row.
 *
 * Exported from the component file, the way useStandardFoodPicker is: every
 * screen that renders AmountChips needs this, and a hook with one consumer per
 * screen is not a second module's worth of surface.
 */
export const useRecentAmounts = (productId: string): RecentAmountsState => {
  const [state, setState] = useState<RecentAmountsState>({ recents: [], isLoading: true });
  useEffect(() => {
    let isCurrent = true;
    recentAmounts(productId)
      .then((loaded) => {
        if (isCurrent) setState({ recents: loaded, isLoading: false });
      })
      // Chips are an accelerator, never the only way in: a failed read leaves
      // the portion chips and the typed field, both fully usable.
      .catch((error) => {
        console.error("Reading recent amounts failed", error);
        if (isCurrent) setState({ recents: [], isLoading: false });
      });
    return () => {
      isCurrent = false;
    };
  }, [productId]);
  return state;
};

interface AmountChipsProps {
  chips: AmountChip[];
  count: string;
  unit: string;
  /** Recents arrive after mount; the row holds its height until they land. */
  isLoading: boolean;
  /** Docked into the "Standard sizes" header row - the portion editor, on the
   * screens that have one. A node rather than a callback so this file stays
   * unaware of portions; the cooking-fat sheet passes nothing. */
  standardAction?: ReactNode;
  onPick: (count: string, unit: string) => void;
}

interface AmountChipButtonProps {
  chip: AmountChip;
  isSelected: boolean;
  onPick: (count: string, unit: string) => void;
}

// A ring, not a colour: the four accents each carry one semantic role
// (protein/carbs/fat/log-success) and "selected" is none of them. The ring
// also serves as the redundant non-colour cue every stateful element needs.
// 2px, not 1: ring-inset against the ghost chip's own surface-raised fill is
// a low-contrast edge, and at 1px it reads as barely-selected at arm's length.
const SELECTED_CHIP_CLASS = "ring-2 ring-inset ring-text";

// 4.5rem is the widest gram chip ("350 g") plus its px-4 padding, so every
// gram chip lands on one width and the wrapped rows line up as columns. A
// chip never grows past its text: stretching to fill the row turns a product
// with one recent amount into a card-wide block that reads as the CTA.
const CHIP_WIDTH_CLASS = "min-w-18";

const AmountChipButton = ({ chip, isSelected, onPick }: AmountChipButtonProps) => (
  <Button
    variant="ghost"
    aria-pressed={isSelected}
    className={isSelected ? `${CHIP_WIDTH_CLASS} ${SELECTED_CHIP_CLASS}` : CHIP_WIDTH_CLASS}
    onClick={() => onPick(String(chip.count), chip.unit)}
  >
    {chipLabel(chip)}
  </Button>
);

interface ChipClusterProps {
  label: string;
  chips: AmountChip[];
  count: string;
  unit: string;
  action?: ReactNode;
  /** Set on the recents cluster only - the standards are known at render. */
  isLoading?: boolean;
  onPick: (count: string, unit: string) => void;
}

/**
 * One labelled group of chips.
 *
 * The label is visible, not an aria-label alone: without it a sighted
 * first-timer reads the row as unexplained bubbles above the amount field.
 * A cluster with no chips renders nothing at all - a product with no history
 * should not show an empty "Your last amounts" heading.
 *
 * An action keeps its cluster alive on its own: a recent replaces the portion
 * chip for the same unit, so a one-portion product logged once has no standard
 * chip left - and the weight behind that unit would become uneditable forever.
 *
 * One pill stands in while recents are still in flight, so the height the row
 * reserves is not simply blank. Delayed on the same threshold as the day view,
 * which means the usual fast read shows no pill at all rather than flashing a
 * label for a cluster that turns out to be empty.
 */
const AmountChipCluster = ({ label, chips, count, unit, action, isLoading = false, onPick }: ChipClusterProps) => {
  const labelId = useId();
  const showSkeleton = useDelayedSkeleton(isLoading);

  if (chips.length === 0 && !action && !showSkeleton) {
    return null;
  }

  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span id={labelId} className="text-xs text-text-muted">
          {label}
        </span>
        {action}
      </div>
      <div className="flex flex-wrap gap-2">
        {showSkeleton ? (
          <Skeleton className="h-11 w-28" />
        ) : (
          chips.map((chip) => (
            <AmountChipButton
              key={`${chip.count} ${chip.unit}`}
              chip={chip}
              isSelected={isChipSelected(chip, count, unit)}
              onPick={onPick}
            />
          ))
        )}
      </div>
    </div>
  );
};

// Recents first: what this user logged last beats what the app supplies.
// "Standard sizes" is the same phrase the portion editor uses for the same
// figures, so the two screens name one thing one way.
const CHIP_CLUSTERS: readonly { source: ChipSource; label: string }[] = [
  { source: "recent", label: "Your last amounts" },
  { source: "standard", label: "Standard sizes" },
];

/**
 * Tappable amounts above the amount field. One tap sets both the count and
 * the unit, which is the whole point: typing "1", opening a select and
 * picking "slice" is four interactions for the app's most repeated entry.
 *
 * Every chip prints its gram weight. A "1 slice" that hides its 28 g turns a
 * reference average into a number the user trusts without ever seeing it.
 */
export const AmountChips = ({ chips, count, unit, isLoading, standardAction, onPick }: AmountChipsProps) => {
  // Nothing to offer and nothing still coming: an empty reserved row would be
  // 48px of dead space on every product that has no chips at all.
  if (chips.length === 0 && !isLoading) {
    return null;
  }

  return (
    <div className="flex min-h-12 flex-col gap-3">
      {CHIP_CLUSTERS.map(({ source, label }) => (
        <AmountChipCluster
          key={source}
          label={label}
          chips={chips.filter((chip) => chip.source === source)}
          count={count}
          unit={unit}
          action={source === "standard" ? standardAction : undefined}
          isLoading={source === "recent" && isLoading}
          onPick={onPick}
        />
      ))}
    </div>
  );
};
