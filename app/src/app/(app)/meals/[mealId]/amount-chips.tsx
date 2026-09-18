"use client";

import { Button } from "@/components/ui/button";

import { chipLabel, isChipSelected, type AmountChip } from "./amount-chips.utils";

interface AmountChipsProps {
  chips: AmountChip[];
  count: string;
  unit: string;
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
const SELECTED_CHIP_CLASS = "ring-1 ring-inset ring-text";

const AmountChipButton = ({ chip, isSelected, onPick }: AmountChipButtonProps) => (
  <Button
    variant="ghost"
    aria-pressed={isSelected}
    className={isSelected ? SELECTED_CHIP_CLASS : ""}
    onClick={() => onPick(String(chip.count), chip.unit)}
  >
    {chipLabel(chip)}
  </Button>
);

/**
 * Tappable amounts above the amount field. One tap sets both the count and
 * the unit, which is the whole point: typing "1", opening a select and
 * picking "slice" is four interactions for the app's most repeated entry.
 *
 * Every chip prints its gram weight. A "1 slice" that hides its 28 g turns a
 * reference average into a number the user trusts without ever seeing it.
 */
export const AmountChips = ({ chips, count, unit, onPick }: AmountChipsProps) => {
  if (chips.length === 0) {
    return null;
  }

  return (
    <div role="group" aria-label="Quick amounts" className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <AmountChipButton
          key={`${chip.count} ${chip.unit}`}
          chip={chip}
          isSelected={isChipSelected(chip, count, unit)}
          onPick={onPick}
        />
      ))}
    </div>
  );
};
