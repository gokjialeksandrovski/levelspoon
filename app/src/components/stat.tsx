export const Stat = ({ value, unit, label }: { value: string; unit?: string; label?: string }) => (
  <div>
    {label && <p className="mb-1 text-xs text-text-muted">{label}</p>}
    <p className="text-[2.5rem] font-semibold leading-none tracking-tight text-accent">
      {value}
      {unit && <span className="ml-1 align-baseline text-sm font-medium text-text-muted">{unit}</span>}
    </p>
  </div>
);
