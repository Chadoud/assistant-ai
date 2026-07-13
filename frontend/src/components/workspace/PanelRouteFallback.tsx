/** Minimal placeholder while a code-split workspace panel chunk loads. */
export default function PanelRouteFallback() {
  return (
    <div
      className="flex flex-1 min-h-0 items-center justify-center text-sm text-muted"
      role="status"
      aria-live="polite"
    >
      <span className="inline-flex items-center gap-2">
        <span
          className="h-4 w-4 rounded-full border-2 border-accent/30 border-t-accent animate-spin"
          aria-hidden
        />
        Loading…
      </span>
    </div>
  );
}
