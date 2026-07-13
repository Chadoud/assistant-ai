/**
 * Two-panel rail glyph for toggling a side conversation or history column.
 * Mirrors the Assistant tab chat header toggle (narrow rail vs emphasized main pane).
 *
 * @param railOpen When true, both panels render muted (rail is expanded / visible).
 */
export function SidebarRailToggleGlyph({
  railOpen,
  className = "h-4 w-4",
}: {
  railOpen: boolean;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
      {railOpen ? (
        <>
          <rect x="1" y="2" width="9" height="12" rx="1.5" opacity="0.35" />
          <rect x="11" y="2" width="4" height="12" rx="1" opacity="0.35" />
        </>
      ) : (
        <>
          <rect x="1" y="2" width="9" height="12" rx="1.5" opacity="0.35" />
          <rect x="11" y="2" width="4" height="12" rx="1" />
        </>
      )}
    </svg>
  );
}
