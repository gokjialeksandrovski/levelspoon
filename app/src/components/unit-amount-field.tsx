import { fieldInputClassName } from "./field";

interface UnitAmountFieldProps {
  name: string;
  count: string;
  unit: string;
  units: string[];
  autoFocus?: boolean;
  onCountChange: (value: string) => void;
  onUnitChange: (value: string) => void;
}

export const UnitAmountField = ({ name, count, unit, units, autoFocus, onCountChange, onUnitChange }: UnitAmountFieldProps) => (
  <div className="flex flex-col gap-2">
    <label htmlFor={name} className="text-xs font-medium text-text-muted">
      Amount
    </label>
    <div className="flex gap-2">
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
      <select
        aria-label="Unit"
        value={unit}
        onChange={(event) => onUnitChange(event.target.value)}
        className={fieldInputClassName(false, undefined)}
      >
        {units.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  </div>
);
