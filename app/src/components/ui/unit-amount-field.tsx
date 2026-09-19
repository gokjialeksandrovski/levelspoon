import { CaretDownIcon } from "@phosphor-icons/react";

import { fieldInputClassName } from "./field";

const UNIT_CHEVRON_SIZE = 14;

interface UnitAmountFieldProps {
  name: string;
  count: string;
  unit: string;
  units: string[];
  autoFocus?: boolean;
  /** Guidance under the field, announced with it - Field's own helperText. */
  helperText?: string;
  onCountChange: (value: string) => void;
  onUnitChange: (value: string) => void;
}

interface CountInputProps {
  name: string;
  count: string;
  autoFocus?: boolean;
  /** Reserves room for the in-field unit suffix - Field's own pr-14. */
  hasSuffix: boolean;
  hasHelperText: boolean;
  onCountChange: (value: string) => void;
}

const CountInput = ({
  name,
  count,
  autoFocus,
  hasSuffix,
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
    className={`w-full appearance-none ${fieldInputClassName(false, undefined)} ${hasSuffix ? "pr-14" : ""}`}
  />
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
const FixedUnit = ({ unit }: { unit: string }) => (
  <span
    aria-hidden="true"
    className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-text-muted"
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
          <CountInput {...{ name, count, autoFocus, onCountChange }} hasSuffix={!hasUnitChoice} hasHelperText={Boolean(helperText)} />
          {!hasUnitChoice && <FixedUnit unit={unit} />}
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
