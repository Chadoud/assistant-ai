interface ListSkeletonProps {
  rows?: number;
  className?: string;
}

/** Placeholder rows while list data loads — replaces centered "Loading…" text. */
export default function ListSkeleton({ rows = 5, className = "" }: ListSkeletonProps) {
  return (
    <div className={`space-y-2 ${className}`.trim()} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-lg border border-border bg-bg-secondary px-4 py-3"
        >
          <div className="h-3.5 w-3/4 rounded bg-bg-primary" />
          <div className="mt-2 h-2.5 w-1/2 rounded bg-bg-primary/70" />
        </div>
      ))}
    </div>
  );
}
