// The image being read is the indicator: a light sweeps the real subject
// rather than placeholder bars. Callers supply the `relative` frame.
// Veil stays light - "we are reading this" only lands while `this` is visible.
const VEIL = "pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden bg-bg/35";
const SWEEP_BAND = "absolute inset-x-0 top-0 h-1/4 animate-scan-sweep bg-[image:var(--gradient-scan-sweep)]";
const STATUS_CHIP = "relative rounded-control border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text";

export const ScanningOverlay = ({ label }: { label: string }) => (
  <div className={VEIL}>
    <span className={SWEEP_BAND} aria-hidden="true" />
    <p role="status" className={STATUS_CHIP}>
      {label}
    </p>
  </div>
);
