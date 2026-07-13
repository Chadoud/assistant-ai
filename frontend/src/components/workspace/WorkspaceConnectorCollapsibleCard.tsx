import type { ReactNode } from "react";
import {
  WORKSPACE_CONNECTOR_CARD_SHELL_CLASS,
} from "../../utils/styles";
import { useI18n } from "../../i18n/I18nContext";
import { WorkspaceSortBlockShell } from "./WorkspaceSortBlockShell";

/**
 * Connection-status copy used by every connector card. Centralised so the 10
 * provider blocks no longer each repeat the "include in run" checkbox, the
 * collapsible header with brand icon + status pill + chevron, and the
 * not-connected guidance — only their provider-specific filter controls differ.
 */
interface WorkspaceConnectorCardCopy {
  /** Visible connector name, e.g. "Dropbox". */
  title: string;
  /** Screen-reader-only heading text. */
  srHeading: string;
  /** Tooltip / aria-label for the "include in run" checkbox. */
  includeInRunLabel: string;
  /** Button label to jump to the External Sources tab. */
  openExternalSourcesLabel: string;
  /** Shown when the provider is not connected and no jump callback is given. */
  notConnectedLabel: string;
  /** Shown when OAuth is configured but the account is not connected. */
  connectUnderSourcesLabel: string;
}

interface WorkspaceConnectorCollapsibleCardProps {
  /** Stable DOM id base, e.g. "workspace-dropbox". */
  idBase: string;
  /** Brand icon node (already sized via its own `compact` prop). */
  icon: ReactNode;
  copy: WorkspaceConnectorCardCopy;

  /** Live account state from `useWorkspaceConnectorAccount`. */
  connected: boolean;
  oauthConfigured: boolean;
  loadingStatus: boolean;
  /** True when the connector still needs setup/connection before it can run. */
  needsExternal: boolean;
  /** Disable the include-checkbox while the backend/account is not ready. */
  includeDisabled: boolean;

  includeInRun: boolean;
  onIncludeInRunChange: (next: boolean) => void;

  sectionOpen: boolean;
  onToggleSection: () => void;

  /** Status / setup summary shown under the title while not fully ready. */
  summaryLine: string;

  onOpenExternalSourcesTab?: () => void;

  /** Provider-specific filter controls rendered inside the expanded panel. */
  children: ReactNode;
}

/**
 * Shared collapsible card chrome for a workspace cloud-sort connector block.
 *
 * Renders the include-in-run checkbox, the brand header with a connection
 * status pill and chevron, and the not-connected guidance. The provider passes
 * its filter controls as `children`; everything else is identical markup that
 * previously lived (verbatim) in each `*WorkspaceSortBlock`.
 */
export function WorkspaceConnectorCollapsibleCard({
  idBase,
  icon,
  copy,
  connected,
  oauthConfigured,
  loadingStatus,
  needsExternal,
  includeDisabled,
  includeInRun,
  onIncludeInRunChange,
  sectionOpen,
  onToggleSection,
  summaryLine,
  onOpenExternalSourcesTab,
  children,
}: WorkspaceConnectorCollapsibleCardProps) {
  const { t } = useI18n();
  const toggleId = `${idBase}-toggle`;
  const panelId = `${idBase}-panel`;

  return (
    <WorkspaceSortBlockShell id={idBase} aria-labelledby={toggleId}>
      <label
        className={`flex shrink-0 items-center self-center pl-0.5 ${
          includeDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
        }`}
        title={copy.includeInRunLabel}
      >
        <input
          type="checkbox"
          className="accent-accent h-4 w-4 shrink-0 rounded border-border"
          checked={includeInRun}
          disabled={includeDisabled}
          aria-label={copy.includeInRunLabel}
          onChange={(e) => onIncludeInRunChange(e.target.checked)}
        />
      </label>

      <div className={WORKSPACE_CONNECTOR_CARD_SHELL_CLASS}>
        <h2 className="sr-only">{copy.srHeading}</h2>
        <button
          type="button"
          className="w-full flex items-center gap-3 p-4 text-left hover:bg-bg-secondary/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
          onClick={onToggleSection}
          id={toggleId}
          aria-expanded={sectionOpen}
          aria-controls={panelId}
        >
          {icon}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-text-primary">{copy.title}</span>
              <span
                className={`text-2xs font-medium px-2 py-0.5 rounded-full ${
                  connected ? "bg-success-soft text-success" : "bg-bg-secondary text-muted border border-border"
                }`}
              >
                {connected ? t("queue.gmailStatusPillReady") : t("queue.gmailStatusPillOff")}
              </span>
            </div>
            {(loadingStatus || !oauthConfigured || !connected) && (
              <p className="text-2xs text-muted mt-0.5 leading-snug truncate">{summaryLine}</p>
            )}
          </div>
          <svg
            className={`w-5 h-5 shrink-0 text-muted transition-transform ${sectionOpen ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </button>

        {sectionOpen && (
          <div
            id={panelId}
            className="px-4 pb-4 pt-3 space-y-4 border-t border-border"
            role="region"
          >
            {needsExternal && onOpenExternalSourcesTab ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenExternalSourcesTab();
                }}
                className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium border border-accent-line bg-accent-light text-accent hover:bg-accent-light/80 transition-colors"
              >
                {copy.openExternalSourcesLabel}
              </button>
            ) : null}
            {needsExternal && !onOpenExternalSourcesTab ? (
              <p className="text-xs text-muted">{copy.notConnectedLabel}</p>
            ) : null}
            {oauthConfigured && !connected && onOpenExternalSourcesTab ? (
              <p className="text-xs text-muted">{copy.connectUnderSourcesLabel}</p>
            ) : null}

            {!needsExternal && (
              <div className="space-y-3 min-w-0">{children}</div>
            )}
          </div>
        )}
      </div>
    </WorkspaceSortBlockShell>
  );
}
