interface OfflineStripAction {
  label: string;
  onClick: () => void | Promise<void>;
}

interface OfflineStripProps {
  message: string;
  /** Optional fix-it button (e.g. retry the local service) shown beside the message. */
  action?: OfflineStripAction;
}

/** Standard offline / API-unavailable banner for second-brain panels. */
export default function OfflineStrip({ message, action }: OfflineStripProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
      <p className="m-0 min-w-0 flex-1">{message}</p>
      {action ? (
        <button
          type="button"
          onClick={() => void action.onClick()}
          className="inline-flex shrink-0 items-center rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-400 transition-colors hover:bg-amber-500/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
