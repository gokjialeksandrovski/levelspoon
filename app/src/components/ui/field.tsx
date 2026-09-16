interface FieldProps {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  required?: boolean;
  error?: string;
  flagged?: boolean;
  inputMode?: "numeric" | "decimal" | "text";
  helperText?: string;
  autoComplete?: string;
  autoFocus?: boolean;
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

export const fieldInputClassName = (flagged: boolean, error: string | undefined): string =>
  `rounded-(--radius-control) border bg-surface px-3 py-3 text-sm text-text placeholder:text-text-muted ${FIELD_FOCUS_RING} ${
    flagged || error ? "border-flag" : "border-text-muted"
  }`;

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

interface FieldInputProps {
  name: string;
  type: string;
  defaultValue?: string;
  value?: string;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  required: boolean;
  error?: string;
  flagged: boolean;
  inputMode?: "numeric" | "decimal" | "text";
  autoComplete?: string;
  autoFocus?: boolean;
  describedBy?: string;
}

// Split out only to stay under the line-count limit; JSX subcomponents like
// this get no dedicated unit test (see Global Constraints).
const FieldInput = ({
  name, type, defaultValue, value, onChange, onBlur, required, error, flagged, inputMode, autoComplete, autoFocus, describedBy,
}: FieldInputProps) => (
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
    required={required}
    aria-invalid={flagged || Boolean(error)}
    aria-describedby={describedBy}
    className={fieldInputClassName(flagged, error)}
  />
);

export const Field = ({
  label, name, type = "text", defaultValue, value, onChange, onBlur,
  required = false, error, flagged = false, inputMode, helperText, autoComplete, autoFocus = false,
}: FieldProps) => (
  <div className="flex flex-col gap-2">
    <label htmlFor={name} className="text-xs font-medium text-text-muted">
      {label}
    </label>
    <FieldInput
      {...{ name, type, defaultValue, value, onChange, onBlur, required, error, flagged, inputMode, autoComplete, autoFocus }}
      describedBy={describedById(name, helperText, error)}
    />
    <FieldMessage name={name} helperText={helperText} error={error} flagged={flagged} />
  </div>
);
