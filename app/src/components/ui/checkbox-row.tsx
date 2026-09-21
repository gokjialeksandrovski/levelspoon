import { useId } from "react";

import { FOCUS_OUTLINE } from "./tap-target";

// A native checkbox - no other wrapper covers one, and the native control
// brings Space to toggle. The whole row is the label, so the tap target is
// the text as well as the box.
interface CheckboxRowProps {
  name: string;
  label: string;
  helperText?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export const CheckboxRow = ({ name, label, helperText, checked, onChange }: CheckboxRowProps) => {
  const helperId = useId();

  return (
    <div className="flex flex-col gap-1">
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-text">
        <input
          type="checkbox"
          name={name}
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-describedby={helperText ? helperId : undefined}
          className={`size-4 shrink-0 accent-text ${FOCUS_OUTLINE}`}
        />
        {label}
      </label>
      {helperText && (
        <p id={helperId} className="pl-7 text-xs text-text-muted">
          {helperText}
        </p>
      )}
    </div>
  );
};
