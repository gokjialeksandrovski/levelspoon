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
}

// py-3 (not py-2.5): matches Button's own 4pt-scale correction, so a Field
// and an adjacent Button land on the same height (found via /critique, 2026-09-09).
export const fieldInputClassName = (flagged: boolean, error: string | undefined): string =>
  `rounded-(--radius-control) border bg-surface px-3 py-3 text-sm text-text placeholder:text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-text ${
    flagged || error ? "border-flag" : "border-border"
  }`;

interface FieldMessageProps {
  helperText: string | undefined;
  error: string | undefined;
  flagged: boolean;
}

const FieldMessage = ({ helperText, error, flagged }: FieldMessageProps) => (
  <>
    {helperText && !error && <p className="text-xs text-text-muted">{helperText}</p>}
    {error && (
      <p className={`text-xs ${flagged ? "text-flag" : "text-danger"}`} role="alert">
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
}

// Kept separate purely for the line budget - Field forwards its already-
// defaulted props here in one spread rather than repeating each on its own
// line, since naming them one per line would cost the same lines this
// split exists to save. A JSX subcomponent, so (like FieldMessage above)
// it gets no dedicated unit test - see Global Constraints.
const FieldInput = ({
  name, type, defaultValue, value, onChange, onBlur, required, error, flagged, inputMode,
}: FieldInputProps) => (
  <input
    id={name}
    name={name}
    type={type}
    inputMode={inputMode}
    defaultValue={defaultValue}
    value={value}
    onChange={onChange}
    onBlur={onBlur}
    required={required}
    aria-invalid={flagged || Boolean(error)}
    className={fieldInputClassName(flagged, error)}
  />
);

export const Field = ({
  label, name, type = "text", defaultValue, value, onChange, onBlur,
  required = false, error, flagged = false, inputMode, helperText,
}: FieldProps) => (
  <div className="flex flex-col gap-2">
    <label htmlFor={name} className="text-xs font-medium text-text-muted">
      {label}
    </label>
    <FieldInput
      {...{ name, type, defaultValue, value, onChange, onBlur, required, error, flagged, inputMode }}
    />
    <FieldMessage helperText={helperText} error={error} flagged={flagged} />
  </div>
);
