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

export const Field = ({
  label, name, type = "text", defaultValue, value, onChange, onBlur,
  required = false, error, flagged = false, inputMode, helperText,
}: FieldProps) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={name} className="text-xs font-medium text-text-muted">
      {label}
    </label>
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
      className={`rounded-[--radius-control] border bg-surface px-3 py-2.5 text-sm text-text placeholder:text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
        flagged || error ? "border-flag" : "border-border"
      }`}
    />
    {helperText && !error && <p className="text-xs text-text-muted">{helperText}</p>}
    {error && <p className="text-xs text-danger" role="alert">{error}</p>}
  </div>
);
