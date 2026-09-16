import { CaretDownIcon } from "@phosphor-icons/react";

import { fieldInputClassName } from "./field";

const UNIT_CHEVRON_SIZE = 14;

interface UnitAmountFieldProps {
  name: string;
  count: string;
  unit: string;
  units: string[];
  autoFocus?: boolean;
  onCountChange: (value: string) => void;
  onUnitChange: (value: string) => void;
}

interface CountInputProps {
  name: string;
  count: string;
  autoFocus?: boolean;
  onCountChange: (value: string) => void;
}

const CountInput = ({
  name,
  count,
  autoFocus,
  onCountChange,
}: CountInputProps) => (
  <input
    id={name}
    name={name}
    type="number"
    inputMode="decimal"
    autoFocus={autoFocus}
    value={count}
    onChange={(event) => onCountChange(event.target.value)}
    className={`flex-1 ${fieldInputClassName(false, undefined)}`}
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
  onCountChange,
  onUnitChange,
}: UnitAmountFieldProps) => (
  <div className="flex flex-col gap-2">
    <label htmlFor={name} className="text-xs font-medium text-text-muted">
      Amount
    </label>
    <div className="flex gap-2">
      <CountInput {...{ name, count, autoFocus, onCountChange }} />
      <UnitSelect unit={unit} units={units} onUnitChange={onUnitChange} />
    </div>
  </div>
);
