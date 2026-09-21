import { useId } from "react";

import { FOCUS_OUTLINE } from "@/components/ui/tap-target";

// Native radios - the documented Rule 16 exception: no project wrapper covers
// them, and the native control brings arrow keys within a group. Each option
// is a card so the whole label is the tap target and the description sits
// inside it.

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

type ChoiceLayout = "stack" | "grid";

// Two columns always, and an odd last card spans both: an auto-fit grid broke
// four options into three plus an orphan at phone width.
const LAYOUT_CLASS: Record<ChoiceLayout, string> = {
  stack: "flex flex-col gap-2",
  grid: "grid grid-cols-2 gap-2 [&>:last-child:nth-child(odd)]:col-span-2",
};

// aria-hidden: the input's own required state is what a screen reader
// announces, so the star is for sighted users only.
export const RequiredMark = () => (
  <span aria-hidden="true" className="text-text">
    {" *"}
  </span>
);

// border-text-muted at rest for the same reason Field uses it: the divider
// border is invisible as a control outline. The chosen card inverts to the
// raised mat plus a full-ink border - no accent, spec direction contract.
const cardClass = (isChecked: boolean): string =>
  `flex min-h-11 cursor-pointer items-start gap-3 rounded-(--radius-control) border px-3 py-3 text-sm ${
    isChecked ? "border-text bg-surface-raised" : "border-text-muted"
  }`;

interface ChoiceCardProps<T extends string> {
  name: string;
  option: ChoiceOption<T>;
  isChecked: boolean;
  required: boolean;
  onChange: (value: T) => void;
}

// aria-labelledby names the radio by its label alone, so "Active" is not also
// "On your feet most of the day…"; the description is read as its description.
const ChoiceCard = <T extends string>({ name, option, isChecked, required, onChange }: ChoiceCardProps<T>) => {
  const labelId = useId();
  const descriptionId = useId();

  return (
    <label className={cardClass(isChecked)}>
      <input
        type="radio"
        name={name}
        value={option.value}
        checked={isChecked}
        required={required}
        onChange={() => onChange(option.value)}
        aria-labelledby={labelId}
        aria-describedby={option.description ? descriptionId : undefined}
        className={`mt-0.5 size-4 shrink-0 accent-text ${FOCUS_OUTLINE}`}
      />
      <span className="flex flex-col gap-0.5">
        <span id={labelId} className="font-medium text-text">
          {option.label}
        </span>
        {option.description && (
          <span id={descriptionId} className="text-xs text-text-muted">
            {option.description}
          </span>
        )}
      </span>
    </label>
  );
};

interface ChoiceGroupProps<T extends string> {
  legend: string;
  name: string;
  options: ChoiceOption<T>[];
  value: T | null;
  helperText?: string;
  layout?: ChoiceLayout;
  required?: boolean;
  onChange: (value: T) => void;
}

export const ChoiceGroup = <T extends string>({
  legend,
  name,
  options,
  value,
  helperText,
  layout = "stack",
  required = false,
  onChange,
}: ChoiceGroupProps<T>) => (
  <fieldset className="flex flex-col gap-2">
    <legend className="mb-1.5 text-xs font-medium text-text-muted">
      {legend}
      {required && <RequiredMark />}
    </legend>
    {helperText && <p className="text-xs text-text-muted">{helperText}</p>}
    <div className={LAYOUT_CLASS[layout]}>
      {options.map((option) => (
        <ChoiceCard
          key={option.value}
          name={name}
          option={option}
          isChecked={value === option.value}
          required={required}
          onChange={onChange}
        />
      ))}
    </div>
  </fieldset>
);
