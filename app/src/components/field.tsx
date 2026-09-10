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

// py-3 (not py-2.5): matches Button's own 4pt-scale correction, so a Field
// and an adjacent Button land on the same height (found via /critique, 2026-09-09).
export const fieldInputClassName = (flagged: boolean, error: string | undefined): string =>
  `rounded-(--radius-control) border bg-surface px-3 py-3 text-sm text-text placeholder:text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-text ${
    flagged || error ? "border-flag" : "border-border"
  }`;

// Which message the input's aria-describedby should point at: the error
// when there is one (it replaces the helper text visually, so it should
// replace it for a screen reader too), otherwise the helper text. Without
// this link a screen-reader user focusing the field hears only its label -
// never the "accepts 52g, 1.8 oz, or 2 tbsp" hint, and never the error
// again once its role="alert" announcement has passed (found via
// /accessibility, 2026-09-10).
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

// Kept separate purely for the line budget - Field forwards its already-
// defaulted props here in one spread rather than repeating each on its own
// line, since naming them one per line would cost the same lines this
// split exists to save. A JSX subcomponent, so (like FieldMessage above)
// it gets no dedicated unit test - see Global Constraints.
const FieldInput = ({
  name, type, defaultValue, value, onChange, onBlur, required, error, flagged, inputMode, autoComplete, autoFocus, describedBy,
}: FieldInputProps) => (
  <input
    id={name}
    name={name}
    type={type}
    inputMode={inputMode}
    autoComplete={autoComplete}
    // Only ever set true by a caller that mounts this field in direct
    // response to a user action (the ingredient row's inline "Edit"), where
    // pulling focus into the field is the point - not a page-load focus
    // steal. Left off everywhere else.
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
