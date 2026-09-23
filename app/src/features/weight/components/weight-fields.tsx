// Field controls shared by the weight goal sheet and the calorie estimate
// page. Moved out of the day route when the second route needed them.
import { Button } from "@/components/ui/button";
import { CheckboxRow } from "@/components/ui/checkbox-row";
import { Field } from "@/components/ui/field";
import { FOCUS_OUTLINE } from "@/components/ui/tap-target";

import { parseDecimalDraft, type WeightUnit } from "../actions/weight.utils";

const UNIT_OPTIONS: WeightUnit[] = ["kg", "lb"];

// Fused into the field's right edge rather than stacked above it: the unit
// belongs to the figure, and a row of its own costs height this sheet does
// not have.
// Raw buttons are the documented Rule 16 exception - no Button variant covers
// a segment sitting inside another control's box.
//
// The selected unit is a filled pill that slides between the two segments
// rather than two segments swapping fill: the movement is what says the two
// are one switch and not two buttons. It is a sibling of the segments, not
// their background, so the pill sits inset from the track while each segment
// stays tappable across the whole track. Colour is bg-text on the raised mat,
// the same inversion the rest of the block uses; the weight feature spends no
// accent (CLAUDE.md).
//
// h-9, not the field's own height: a full-height track's rounded ends land on
// the input's border and read as a hole punched through the box rather than a
// control sitting inside it. 36 x 40 per segment stays well past WCAG 2.5.8's
// 24px target floor - the 44px reach target belongs to controls that stand
// alone, not to one riding inside a field the thumb is already aimed at.
const PILL_OFFSET: Record<WeightUnit, string> = { kg: "translate-x-0", lb: "translate-x-10" };

export const UnitToggle = ({ unit, onChange }: { unit: WeightUnit; onChange: (unit: WeightUnit) => void }) => (
  <div
    role="group"
    aria-label="Weight unit"
    className="relative flex h-9 items-stretch rounded-full bg-surface-raised p-1"
  >
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-y-1 left-1 w-10 rounded-full bg-text transition-transform duration-(--duration-step) ease-out-quart motion-reduce:transition-none ${PILL_OFFSET[unit]}`}
    />
    {UNIT_OPTIONS.map((option) => (
      <button
        key={option}
        type="button"
        onClick={() => onChange(option)}
        aria-pressed={unit === option}
        className={`relative flex w-10 items-center justify-center rounded-full text-sm transition-colors ${FOCUS_OUTLINE} ${
          unit === option ? "font-medium text-bg" : "text-text-muted hover:text-text"
        }`}
      >
        {option}
      </button>
    ))}
  </div>
);

// The unit a field is already governed by, printed where its toggle would be.
// aria-hidden: the field's own label and the toggle above already name it.
export const UnitSuffix = ({ children }: { children: string }) => (
  <span aria-hidden="true" className="pointer-events-none pr-3 text-sm text-text-muted">
    {children}
  </span>
);

export interface PresetFieldProps {
  label: string;
  name: string;
  suffix: string;
  value: string;
  presets: number[];
  presetLabel?: (value: number) => string;
  helperText?: string;
  onChange: (value: string) => void;
}

// One value, one control. The chips are accelerators that write into the
// field - the same relationship AmountChips has with the amount field - so a
// figure nobody put on a chip is still typeable, and the chips still say what
// the common answers are.
export const PresetField = ({
  label,
  name,
  suffix,
  value,
  presets,
  presetLabel,
  helperText,
  onChange,
}: PresetFieldProps) => {
  const selected = parseDecimalDraft(value);

  return (
    <div className="flex flex-col gap-2">
      <Field
        label={label}
        name={name}
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        helperText={helperText}
        trailing={<UnitSuffix>{suffix}</UnitSuffix>}
      />
      <div className="flex gap-2">
        {presets.map((preset) => (
          <Button
            key={preset}
            variant={preset === selected ? "primary" : "ghost"}
            className="flex-1 px-0 tabular-nums"
            aria-pressed={preset === selected}
            onClick={() => onChange(String(preset))}
          >
            {presetLabel ? presetLabel(preset) : preset}
          </Button>
        ))}
      </div>
    </div>
  );
};

export const BAND_HELPER = "How far above or below your current weight still counts as steady.";

// PUBLISHED - Morton RW et al., Br J Sports Med 2018;52:376: protein's effect
// on lean mass gains plateaus near 1.6 g/kg/day, upper 95% CI 2.2. The pound
// row is the same range divided by 2.2046, rounded to what a person would say,
// and 0.8 g per lb is the stored RECOMP_PROTEIN_G_PER_KG read in pounds.
const RECOMP_HELPER: Record<WeightUnit, string> = {
  kg: "Build muscle and lose fat while your weight stays about the same. Needs strength training and 1.6 to 2.2 g of protein per kg a day. Saving starts protein at 1.8 g per kg unless you set macro targets yourself. Change it any time under Set goal on the main page.",
  lb: "Build muscle and lose fat while your weight stays about the same. Needs strength training and 0.7 to 1 g of protein per lb a day. Saving starts protein at 0.8 g per lb unless you set macro targets yourself. Change it any time under Set goal on the main page.",
};

interface RecompCheckboxProps {
  unit: WeightUnit;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

// A modifier on holding steady, not a goal of its own: recomp keeps the scale
// where it is, so it lives under the band on both the sheet and the estimate.
export const RecompCheckbox = ({ unit, checked, onChange }: RecompCheckboxProps) => (
  <CheckboxRow name="recomp" label="Recomp" helperText={RECOMP_HELPER[unit]} checked={checked} onChange={onChange} />
);
