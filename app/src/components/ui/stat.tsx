export type StatTone = "default" | "danger";

const VALUE_TONE_CLASS: Record<StatTone, string> = {
  default: "text-text",
  danger: "text-danger",
};

const UNIT_TONE_CLASS: Record<StatTone, string> = {
  default: "text-text-muted",
  danger: "text-danger",
};

export const Stat = ({
  value,
  unit,
  label,
  tone = "default",
}: {
  value: React.ReactNode;
  unit?: string;
  label?: string;
  tone?: StatTone;
}) => (
  <div>
    {label && <p className="mb-1 text-xs text-text-muted">{label}</p>}
    <p className={`font-display text-[2.5rem] font-semibold leading-none tracking-tight ${VALUE_TONE_CLASS[tone]}`}>
      {value}
      {unit && <span className={`ml-1 align-baseline text-sm font-medium ${UNIT_TONE_CLASS[tone]}`}>{unit}</span>}
    </p>
  </div>
);
