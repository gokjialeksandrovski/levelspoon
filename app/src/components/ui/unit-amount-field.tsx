import { CaretDownIcon, XIcon } from "@phosphor-icons/react";

import { fieldInputClassName } from "./field";
import { FOCUS_RING } from "./tap-target";

const UNIT_CHEVRON_SIZE = 14;
const TRAILING_ICON_SIZE = 18;

/**
 * An icon control drawn inside the field's right edge. The field only draws
 * it; what it means (clear, cancel, ...) is the caller's, so the caller owns
 * the label.
 */
export interface FieldTrailingAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

interface UnitAmountFieldProps {
  name: string;
  count: string;
  unit: string;
  units: string[];
  autoFocus?: boolean;
  /** Guidance under the field, announced with it - Field's own helperText. */
  helperText?: string;
  trailingAction?: FieldTrailingAction;
  onCountChange: (value: string) => void;
  onUnitChange: (value: string) => void;
}

// Right-edge padding that keeps the typed figure clear of whatever the field
// carries inside it: the unit suffix, the trailing icon, or both.
const COUNT_PADDING = { none: "", suffix: "pr-14", action: "pr-12", both: "pr-20" } as const;

const countPadding = (hasSuffix: boolean, hasAction: boolean): string => {
  if (hasSuffix && hasAction) return COUNT_PADDING.both;
  if (hasSuffix) return COUNT_PADDING.suffix;
  return hasAction ? COUNT_PADDING.action : COUNT_PADDING.none;
};

interface CountInputProps {
  name: string;
  count: string;
  autoFocus?: boolean;
  /** Reserves room for the in-field unit suffix - Field's own pr-14. */
  hasSuffix: boolean;
  hasTrailingAction: boolean;
  hasHelperText: boolean;
  onCountChange: (value: string) => void;
}

const CountInput = ({
  name,
  count,
  autoFocus,
  hasSuffix,
  hasTrailingAction,
  hasHelperText,
  onCountChange,
}: CountInputProps) => (
  <input
    id={name}
    name={name}
    aria-describedby={hasHelperText ? `${name}-unit ${name}-helper` : `${name}-unit`}
    type="number"
    inputMode="decimal"
    autoFocus={autoFocus}
    value={count}
    onChange={(event) => onCountChange(event.target.value)}
    className={`w-full appearance-none ${fieldInputClassName(false, undefined)} ${countPadding(hasSuffix, hasTrailingAction)}`}
  />
);

// Full field height, so the 44px touch floor is met without the button growing
// the box. Sits flush at the right edge; the unit suffix steps aside for it.
const TrailingActionButton = ({ action }: { action: FieldTrailingAction }) => (
  <button
    type="button"
    onClick={action.onClick}
    disabled={action.disabled}
    aria-label={action.label}
    className={`absolute inset-y-0 right-0 flex w-11 items-center justify-center text-text-muted transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-text-muted ${FOCUS_RING}`}
  >
    <XIcon size={TRAILING_ICON_SIZE} weight="regular" />
  </button>
);

interface UnitSelectProps {
  unit: string;
  units: string[];
  onUnitChange: (value: string) => void;
}

const SelectChevron = () => (
  <CaretDownIcon
    size={UNIT_CHEVRON_SIZE}
    aria-hidden
    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
  />
);

// One unit is nothing to choose: a one-option dropdown reads as broken, so the
// unit is printed as an in-field suffix instead - the same overlay Field uses
// for its trailing control. Beside the box it read as a stray letter floating
// in the column rather than as part of the amount.
const FixedUnit = ({ unit, isShifted }: { unit: string; isShifted: boolean }) => (
  <span
    aria-hidden="true"
    className={`pointer-events-none absolute inset-y-0 ${isShifted ? "right-12" : "right-3"} flex items-center text-sm text-text-muted`}
  >
    {unit}
  </span>
);

const UnitSelect = ({ unit, units, onUnitChange }: UnitSelectProps) => (
  <div className="relative">
    <select
      aria-label="Unit"
      value={unit}
      onChange={(event) => onUnitChange(event.target.value)}
      className={`w-full appearance-none pr-9 ${fieldInputClassName(false, undefined)}`}
    >
      {units.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
    <SelectChevron />
  </div>
);

export const UnitAmountField = ({
  name,
  count,
  unit,
  units,
  autoFocus,
  helperText,
  trailingAction,
  onCountChange,
  onUnitChange,
}: UnitAmountFieldProps) => {
  const hasUnitChoice = units.length > 1;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-xs font-medium text-text-muted">
        Amount
      </label>
      {/* The unit is its own control, or a suffix the figure does not contain,
          so either way the figure carries it as its description. */}
      <span id={`${name}-unit`} className="sr-only">
        in {unit}
      </span>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <CountInput
            {...{ name, count, autoFocus, onCountChange }}
            hasSuffix={!hasUnitChoice}
            hasTrailingAction={Boolean(trailingAction)}
            hasHelperText={Boolean(helperText)}
          />
          {!hasUnitChoice && <FixedUnit unit={unit} isShifted={Boolean(trailingAction)} />}
          {trailingAction && <TrailingActionButton action={trailingAction} />}
        </div>
        {hasUnitChoice && <UnitSelect unit={unit} units={units} onUnitChange={onUnitChange} />}
      </div>
      {helperText && (
        <p id={`${name}-helper`} className="text-xs text-text-muted">
          {helperText}
        </p>
      )}
    </div>
  );
};
