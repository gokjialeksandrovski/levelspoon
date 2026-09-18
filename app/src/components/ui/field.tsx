interface FieldProps {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  required?: boolean;
  minLength?: number;
  error?: string;
  flagged?: boolean;
  inputMode?: "numeric" | "decimal" | "text";
  helperText?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  /** Keeps the value focusable and announced while refusing edits - the
   * state a field earns when its helperText explains why it cannot change. */
  readOnly?: boolean;
  // In-field trailing control (password reveal, unit picker). Overlaid on the
  // input rather than placed beside it so the box stays one visual control.
  trailing?: React.ReactNode;
}

// py-3 matches Button's 4pt-scale correction so a Field and adjacent Button
// land on the same height.
// border-text-muted, not border-border: --color-border (~1.1:1 against
// --color-surface) is a divider weight, invisible as a control outline.
// text-muted already clears 3:1 UI-component contrast and matches the
// label's ink tone above it.
// Focus paints an inset ring on top of the border, not an offset outline: an
// offset outline reads as a second, detached ring, and its left/right arcs get
// clipped flat by Sheet's scroll container. Inset stays inside the box.
const FIELD_FOCUS_RING =
  "focus-visible:outline-none focus-visible:border-text focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-text";

// A read-only field stays a real, focusable control - it is not "inactive", so
// WCAG 1.4.3's exemption for disabled components does not cover it and its ink
// cannot be dimmed the way the disabled state's is. text-muted on the raised
// mat measures 5.21:1 (dark) / 5.23:1 (light) via lib/theme/contrast.ts, past
// the 4.5:1 floor; the mat and the divider-weight border, not faded ink, are
// what say "you cannot type here". Pinned by field.test.ts.
const READ_ONLY_SURFACE = "bg-surface-raised text-text-muted";
const EDITABLE_SURFACE = "bg-surface text-text";

const borderColorClass = (flagged: boolean, error: string | undefined, readOnly: boolean): string => {
  if (flagged || error) {
    return "border-flag";
  }
  return readOnly ? "border-border" : "border-text-muted";
};

export const fieldInputClassName = (
  flagged: boolean,
  error: string | undefined,
  readOnly = false,
): string =>
  `rounded-(--radius-control) border ${readOnly ? READ_ONLY_SURFACE : EDITABLE_SURFACE} px-3 py-3 text-sm placeholder:text-text-muted ${FIELD_FOCUS_RING} ${borderColorClass(flagged, error, readOnly)}`;

// Points aria-describedby at the error (replaces helper text visually, so
// it should replace it for screen readers too), else the helper text.
const describedById = (name: string, helperText: string | undefined, error: string | undefined): string | undefined => {
  if (error) return `${name}-error`;
  if (helperText) return `${name}-helper`;
  return undefined;
};

interface FieldMessageProps {
  name: string;
  helperText: string | undefined;
  error: string | undefined;
  flagged: boolean;
}

const FieldMessage = ({ name, helperText, error, flagged }: FieldMessageProps) => (
  <>
    {helperText && !error && (
      <p id={`${name}-helper`} className="text-xs text-text-muted">
        {helperText}
      </p>
    )}
    {error && (
      <p id={`${name}-error`} className={`text-xs ${flagged ? "text-flag" : "text-danger"}`} role="alert">
        {error}
      </p>
    )}
  </>
);

export const Field = ({
  label, name, type = "text", defaultValue, value, onChange, onBlur,
  required = false, minLength, error, flagged = false, inputMode, helperText, autoComplete, autoFocus = false,
  readOnly = false,
  trailing,
}: FieldProps) => (
  <div className="flex flex-col gap-2">
    <label htmlFor={name} className="text-xs font-medium text-text-muted">
      {label}
    </label>
    <div className="relative flex flex-col">
      <input
        id={name}
        name={name}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        // True only when a caller mounts this in direct response to a user action
        // (e.g. ingredient row's inline Edit) - never a page-load focus steal.
        autoFocus={autoFocus}
        defaultValue={defaultValue}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        readOnly={readOnly}
        required={required}
        minLength={minLength}
        aria-invalid={flagged || Boolean(error)}
        aria-describedby={describedById(name, helperText, error)}
        className={`${fieldInputClassName(flagged, error, readOnly)} ${trailing ? "pr-14" : ""}`}
      />
      {/* pr-1 keeps the 44px control's own ring clear of the input's border. */}
      {trailing && <div className="absolute inset-y-0 right-0 flex items-center pr-1">{trailing}</div>}
    </div>
    <FieldMessage name={name} helperText={helperText} error={error} flagged={flagged} />
  </div>
);
