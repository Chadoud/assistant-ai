/** Animated placeholder rendered while a file is still pending analysis. */
export default function SkeletonCard() {
  return (
    <div className="flex items-center gap-3 pl-0 pr-3 py-0 rounded-xl border border-border bg-bg-card overflow-hidden animate-pulse">
      {/* Left accent bar placeholder */}
      <div className="w-1 self-stretch shrink-0 rounded-l-xl bg-border" />

      {/* Icon placeholder */}
      <div className="w-7 h-7 rounded-lg bg-surface-subtle shrink-0 my-3" />

      {/* Text lines */}
      <div className="flex-1 space-y-2 min-w-0 py-3">
        <div className="h-3 rounded bg-surface-subtle w-2/3" />
        <div className="h-2.5 rounded bg-surface-subtle w-1/2" />
      </div>

      {/* Badge placeholder */}
      <div className="w-16 h-5 rounded-full bg-surface-subtle shrink-0" />
    </div>
  );
}
