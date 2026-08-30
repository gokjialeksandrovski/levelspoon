export const Skeleton = ({ className = "" }: { className?: string }) => (
  <div className={`animate-pulse rounded-[--radius-control] bg-surface-raised ${className}`} aria-hidden="true" />
);
