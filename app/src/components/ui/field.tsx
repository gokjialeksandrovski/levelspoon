interface FieldProps {
  // ReactNode so a caller can append an aria-hidden marker, such as a
  // required "*", that stays out of the accessible name.
  label: React.ReactNode;
  name: string;
  type?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
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
  /** Right padding reserved for `trailing`. Default fits one 44px control. */
  trailingReserveClass?: string;
}

const DEFAULT_TRAILING_RESERVE = "pr-14";

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

const FULL_PADDING = "px-3 py-3";

export const fieldInputClassName = (
  flagged: boolean,
  error: string | undefined,
  readOnly = false,
  padding = FULL_PADDING,
): string =>
  `rounded-(--radius-control) border ${readOnly ? READ_ONLY_SURFACE : EDITABLE_SURFACE} ${padding} text-sm placeholder:text-text-muted ${FIELD_FOCUS_RING} ${borderColorClass(flagged, error, readOnly)}`;

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
  required = false, minLength, maxLength, error, flagged = false, inputMode, helperText, autoComplete, autoFocus = false,
  readOnly = false,
  trailing,
  trailingReserveClass = DEFAULT_TRAILING_RESERVE,
}: FieldProps) => (
  <div className="flex flex-col gap-1.5">
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
        maxLength={maxLength}
        aria-invalid={flagged || Boolean(error)}
        aria-describedby={describedById(name, helperText, error)}
        className={`${fieldInputClassName(flagged, error, readOnly)} ${trailing ? trailingReserveClass : ""}`}
      />
      {/* pr-1 keeps the 44px control's own ring clear of the input's border. */}
      {trailing && <div className="absolute inset-y-0 right-0 flex items-center pr-1">{trailing}</div>}
    </div>
    <FieldMessage name={name} helperText={helperText} error={error} flagged={flagged} />
  </div>
);

interface TextAreaFieldProps {
  label: React.ReactNode;
  name: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  helperText?: string;
  error?: string;
  maxLength?: number;
  rows?: number;
}

const DEFAULT_TEXTAREA_ROWS = 4;

// Field's box, label and message, for free text longer than one line. A
// sibling rather than a `multiline` flag: every Field prop typed against
// HTMLInputElement would need a union.
export const TextAreaField = ({ label, name, value, onChange, helperText, error, maxLength, rows = DEFAULT_TEXTAREA_ROWS }: TextAreaFieldProps) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={name} className="text-xs font-medium text-text-muted">
      {label}
    </label>
    <textarea
      id={name}
      name={name}
      rows={rows}
      value={value}
      onChange={onChange}
      maxLength={maxLength}
      aria-invalid={Boolean(error)}
      aria-describedby={describedById(name, helperText, error)}
      className={`${fieldInputClassName(false, error)} resize-y`}
    />
    <FieldMessage name={name} helperText={helperText} error={error} flagged={false} />
  </div>
);

interface FigureFieldProps {
  label: React.ReactNode;
  name: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  type?: "text" | "number";
  /** Shown inside the box after the figure; hidden from assistive tech, so
   * the label must already say it. */
  unit?: string;
  /** A sub-row, printed the way an EU label indents "of which" figures. */
  indent?: boolean;
  /** Muted line under the label, e.g. what the figure works out to. */
  detail?: React.ReactNode;
  error?: string;
  flagged?: boolean;
  /** One control after the box, such as an icon-only remove. */
  action?: React.ReactNode;
}

const FigureLabel = ({ name, label, detail, indent }: Pick<FigureFieldProps, "name" | "label" | "detail"> & { indent: boolean }) => (
  <div className={`flex min-w-0 flex-1 flex-col ${indent ? "pl-4" : ""}`}>
    <label htmlFor={name} className={`text-sm ${indent ? "text-text-muted" : "text-text"}`}>
      {label}
    </label>
    {detail && <p className="text-xs tabular-nums text-text-muted">{detail}</p>}
  </div>
);

const UnitSuffix = ({ unit }: { unit: string }) => (
  <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-text-muted">
    {unit}
  </span>
);

// Field's box on one row with its label, like a line of a nutrition table:
// a column of figures checked against a label reads down one edge instead of
// scrolling through a stack of full-width boxes. Sized to the figure, not the
// row: w-20 holds "1234.5", or four digits beside a unit. The box drops below
// the 44px floor on purpose - the label is its htmlFor, so the whole row is
// the tap target.
const FIGURE_PADDING = "px-2.5 py-2";
export const FigureField = ({ label, name, value, onChange, onBlur, type = "text", unit, indent = false, detail, error, flagged = false, action }: FigureFieldProps) => (
  <div className="flex flex-col gap-1 py-1.5">
    <div className="flex items-center gap-3">
      <FigureLabel name={name} label={label} detail={detail} indent={indent} />
      <div className="relative w-20 shrink-0">
        <input
          id={name}
          name={name}
          type={type}
          inputMode="decimal"
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          aria-invalid={flagged || Boolean(error)}
          aria-describedby={error ? `${name}-error` : undefined}
          className={`${fieldInputClassName(flagged, error, false, FIGURE_PADDING)} w-full text-right tabular-nums ${unit ? "pr-7" : ""}`}
        />
        {unit && <UnitSuffix unit={unit} />}
      </div>
      {action}
    </div>
    <FieldMessage name={name} helperText={undefined} error={error} flagged={flagged} />
  </div>
);
