import { useCallback, useId, useMemo, useState } from "react";
import type { AppSettings } from "../../types/settings";
import {
  WORKSPACE_CONNECTOR_CONTROL_CLASS,
  WORKSPACE_CONNECTOR_FILTERS_ONLY_PANEL_CLASS,
  WORKSPACE_CONNECTOR_SELECT_CLASS,
  WORKSPACE_CONNECTOR_SUBSECTION_HEADER_CLASS,
  WORKSPACE_CONNECTOR_SUBSECTION_HINT_CLASS,
  WORKSPACE_CONNECTOR_SUBSECTION_TITLE_CLASS,
} from "../../utils/styles";
import { useI18n } from "../../i18n/I18nContext";
import { useWorkspaceConnectorAccount } from "../../hooks/useWorkspaceConnectorAccount";
import { OutlookBrandIcon } from "../../externalSources/ExternalSourceBrandIcons";
import { MICROSOFT_INTEGRATION_CHANGED_EVENT } from "../externalSources/OneDriveConnectionSection";
import type { OutlookMergePrefs, OutlookDateFilter, OutlookFolder } from "./outlookWorkspaceImportResolve";
import { WorkspaceConnectorFieldColumn, WorkspaceConnectorFormGrid } from "./WorkspaceConnectorFormGrid";
import { WorkspaceConnectorCollapsibleCard } from "./WorkspaceConnectorCollapsibleCard";
import WorkspaceMailFolderPicker from "./WorkspaceMailFolderPicker";
import { WorkspaceSortBlockShell } from "./WorkspaceSortBlockShell";
import { useSyncWorkspaceMergePrefs } from "./useSyncWorkspaceMergePrefs";

export type { OutlookMergePrefs };

export interface OutlookWorkspaceSortBlockProps {
  settings: AppSettings;
  backendOnline: boolean;
  onOutlookMergePrefsChange: (prefs: OutlookMergePrefs | null) => void;
  onOpenExternalSourcesTab?: () => void;
  hideWorkspacePrimaryImportButton?: boolean;
}

/**
 * Workspace block: Outlook mail filter dropdowns.
 * Run sort fetches all pages from the selected folder, filters by date,
 * then imports each message as a .txt file (see outlookWorkspaceImportResolve).
 */
export default function OutlookWorkspaceSortBlock({
  settings: _settings,
  backendOnline,
  onOutlookMergePrefsChange,
  onOpenExternalSourcesTab,
  hideWorkspacePrimaryImportButton: _hideWorkspacePrimaryImportButton,
}: OutlookWorkspaceSortBlockProps) {
  void _settings;
  void _hideWorkspacePrimaryImportButton;
  const { t } = useI18n();
  const filterFormId = useId();
  const filterFolderId = `${filterFormId}-folder`;
  const filterDateId = `${filterFormId}-date`;
  const filterSinceId = `${filterFormId}-since`;
  const [sectionOpen, setSectionOpen] = useState(false);
  const [includeInRun, setIncludeInRun] = useState(false);
  const [folder, setFolder] = useState<OutlookFolder>("Inbox");
  const [dateFilter, setDateFilter] = useState<OutlookDateFilter>("any");
  const [sinceDate, setSinceDate] = useState("");
  const [includeAttachments, setIncludeAttachments] = useState(false);

  const { desktop, connected, oauthConfigured, loadingStatus } = useWorkspaceConnectorAccount({
    providerId: "outlook",
    integrationChangedEvent: MICROSOFT_INTEGRATION_CHANGED_EVENT,
  });

  const mergePayload = useCallback((): OutlookMergePrefs | null => {
    if (!includeInRun || !connected) return null;
    return {
      enabled: true,
      folder,
      dateFilter,
      sinceDate,
      includeAttachments,
    };
  }, [includeInRun, connected, folder, dateFilter, sinceDate, includeAttachments]);

  useSyncWorkspaceMergePrefs(onOutlookMergePrefsChange, mergePayload);

  const needsExternal = !desktop || !oauthConfigured || !connected;
  const accountBusy = !backendOnline || !connected || loadingStatus;

  const summaryLine = useMemo(() => {
    if (!desktop) return t("queue.outlookWorkspaceElectronOnly");
    if (loadingStatus) return t("sources.outlookTitle");
    if (!oauthConfigured) return t("queue.outlookWorkspaceOauthSetup");
    if (!connected) return t("queue.outlookWorkspaceNotConnected");
    return t("queue.outlookWorkspaceRunUsesFilters");
  }, [desktop, loadingStatus, oauthConfigured, connected, t]);

  if (!desktop) {
    return (
      <WorkspaceSortBlockShell id="workspace-outlook" aria-label={t("sources.outlookTitle")}>
        <div className="w-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1 rounded-xl border border-border bg-bg-card/60 p-4 text-sm text-muted">
          {t("queue.outlookWorkspaceElectronOnly")}
        </div>
      </WorkspaceSortBlockShell>
    );
  }

  return (
    <WorkspaceConnectorCollapsibleCard
      idBase="workspace-outlook"
      icon={<OutlookBrandIcon compact />}
      copy={{
        title: t("sources.outlookTitle"),
        srHeading: t("queue.outlookWorkspaceHeading"),
        includeInRunLabel: t("queue.workspaceIncludeOutlookInRun"),
        openExternalSourcesLabel: t("queue.outlookOpenExternalSources"),
        notConnectedLabel: t("queue.outlookWorkspaceNotConnected"),
        connectUnderSourcesLabel: t("queue.outlookConnectUnderSources"),
      }}
      connected={connected}
      oauthConfigured={oauthConfigured}
      loadingStatus={loadingStatus}
      needsExternal={needsExternal}
      includeDisabled={accountBusy}
      includeInRun={includeInRun}
      onIncludeInRunChange={setIncludeInRun}
      sectionOpen={sectionOpen}
      onToggleSection={() => setSectionOpen((o) => !o)}
      summaryLine={summaryLine}
      onOpenExternalSourcesTab={onOpenExternalSourcesTab}
    >
      <div className={WORKSPACE_CONNECTOR_FILTERS_ONLY_PANEL_CLASS}>
        <div className={WORKSPACE_CONNECTOR_SUBSECTION_HEADER_CLASS}>
          <span className={WORKSPACE_CONNECTOR_SUBSECTION_TITLE_CLASS}>
            {t("queue.outlookWorkspaceSectionFilters")}
          </span>
          <span className={WORKSPACE_CONNECTOR_SUBSECTION_HINT_CLASS}>
            {t("queue.outlookWorkspaceSectionFiltersHint")}
          </span>
        </div>
        <WorkspaceConnectorFormGrid>
          <WorkspaceConnectorFieldColumn column={1} label={t("queue.outlookFilterFolder")} htmlFor={filterFolderId}>
            <WorkspaceMailFolderPicker
              id={filterFolderId}
              value={folder}
              onChange={setFolder}
              disabled={accountBusy}
            />
          </WorkspaceConnectorFieldColumn>
          <WorkspaceConnectorFieldColumn column={2} label={t("queue.driveFilterDate")} htmlFor={filterDateId}>
            <div className="flex flex-wrap items-end gap-2 w-full min-w-0">
              <select
                id={filterDateId}
                className={`${WORKSPACE_CONNECTOR_SELECT_CLASS} min-w-0 flex-1 basis-[8rem] sm:min-w-0`}
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as OutlookDateFilter)}
                disabled={accountBusy}
              >
                <option value="any">{t("queue.driveFilterDateAny")}</option>
                <option value="7d">{t("queue.driveFilterDate7d")}</option>
                <option value="30d">{t("queue.driveFilterDate30d")}</option>
                <option value="since">{t("queue.driveFilterDateSince")}</option>
              </select>
              {dateFilter === "since" ? (
                <div className="flex flex-col gap-1.5 min-w-0 w-full sm:w-auto shrink-0">
                  <label
                    htmlFor={filterSinceId}
                    className="text-2xs font-semibold text-muted uppercase tracking-wider"
                  >
                    {t("queue.driveFilterDateFrom")}
                  </label>
                  <input
                    id={filterSinceId}
                    type="date"
                    className={`${WORKSPACE_CONNECTOR_CONTROL_CLASS} w-full sm:w-[min(100%,10.5rem)] min-w-0 h-10 py-0`}
                    value={sinceDate}
                    onChange={(e) => setSinceDate(e.target.value)}
                    disabled={accountBusy}
                  />
                </div>
              ) : null}
            </div>
          </WorkspaceConnectorFieldColumn>
          <WorkspaceConnectorFieldColumn column={3} label={t("queue.outlookFilterAttachments")}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="accent-accent h-4 w-4 rounded border-border"
                checked={includeAttachments}
                disabled={accountBusy}
                onChange={(e) => setIncludeAttachments(e.target.checked)}
              />
              <span className="text-sm text-text-primary">{t("queue.outlookFilterAttachmentsLabel")}</span>
            </label>
          </WorkspaceConnectorFieldColumn>
        </WorkspaceConnectorFormGrid>
      </div>
    </WorkspaceConnectorCollapsibleCard>
  );
}
