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
import { InfomaniakBrandIcon } from "../../externalSources/ExternalSourceBrandIcons";
import { INFOMANIAK_DRIVE_INTEGRATION_CHANGED_EVENT } from "../externalSources/infomaniakIntegrationEvents";
import type {
  InfomaniakMailDateFilter,
  InfomaniakMailFolder,
  InfomaniakMailMergePrefs,
} from "./infomaniakMailWorkspaceImportResolve";
import { WorkspaceConnectorFieldColumn, WorkspaceConnectorFormGrid } from "./WorkspaceConnectorFormGrid";
import { WorkspaceConnectorCollapsibleCard } from "./WorkspaceConnectorCollapsibleCard";
import WorkspaceMailFolderPicker from "./WorkspaceMailFolderPicker";
import { WorkspaceSortBlockShell } from "./WorkspaceSortBlockShell";
import { useSyncWorkspaceMergePrefs } from "./useSyncWorkspaceMergePrefs";

export type { InfomaniakMailMergePrefs };

export interface InfomaniakMailWorkspaceSortBlockProps {
  settings: AppSettings;
  backendOnline: boolean;
  onInfomaniakMailMergePrefsChange: (prefs: InfomaniakMailMergePrefs | null) => void;
  onOpenExternalSourcesTab?: () => void;
  hideWorkspacePrimaryImportButton?: boolean;
}

/**
 * Workspace strip: Infomaniak Mail — same OAuth slot as kDrive; progressive import as .txt files.
 */
export default function InfomaniakMailWorkspaceSortBlock({
  settings: _settings,
  backendOnline,
  onInfomaniakMailMergePrefsChange,
  onOpenExternalSourcesTab,
  hideWorkspacePrimaryImportButton: _hide,
}: InfomaniakMailWorkspaceSortBlockProps) {
  void _settings;
  void _hide;
  const { t } = useI18n();
  const filterFormId = useId();
  const filterFolderId = `${filterFormId}-ik-mail-folder`;
  const filterDateId = `${filterFormId}-ik-mail-date`;
  const filterSinceId = `${filterFormId}-ik-mail-since`;
  const [sectionOpen, setSectionOpen] = useState(false);
  const [includeInRun, setIncludeInRun] = useState(false);
  const [folder, setFolder] = useState<InfomaniakMailFolder>("Inbox");
  const [dateFilter, setDateFilter] = useState<InfomaniakMailDateFilter>("any");
  const [sinceDate, setSinceDate] = useState("");

  const { desktop, connected, oauthConfigured, loadingStatus } = useWorkspaceConnectorAccount({
    providerId: "infomaniak",
    integrationChangedEvent: INFOMANIAK_DRIVE_INTEGRATION_CHANGED_EVENT,
  });

  const mergePayload = useCallback((): InfomaniakMailMergePrefs | null => {
    if (!includeInRun || !connected) return null;
    return { enabled: true, folder, dateFilter, sinceDate };
  }, [includeInRun, connected, folder, dateFilter, sinceDate]);

  useSyncWorkspaceMergePrefs(onInfomaniakMailMergePrefsChange, mergePayload);

  const needsExternal = !desktop || !oauthConfigured || !connected;
  const accountBusy = !backendOnline || !connected || loadingStatus;

  const summaryLine = useMemo(() => {
    if (!desktop) return t("queue.infomaniakMailWorkspaceElectronOnly");
    if (loadingStatus) return t("sources.infomaniakMailTitle");
    if (!oauthConfigured) return t("queue.infomaniakMailWorkspaceOauthSetup");
    if (!connected) return t("queue.infomaniakMailWorkspaceNotConnected");
    return t("queue.infomaniakMailWorkspaceRunUsesFilters");
  }, [desktop, loadingStatus, oauthConfigured, connected, t]);

  if (!desktop) {
    return (
      <WorkspaceSortBlockShell id="workspace-infomaniak-mail" aria-label={t("sources.infomaniakMailTitle")}>
        <div className="w-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1 rounded-xl border border-border bg-bg-card/60 p-4 text-sm text-muted">
          {t("queue.infomaniakMailWorkspaceElectronOnly")}
        </div>
      </WorkspaceSortBlockShell>
    );
  }

  return (
    <WorkspaceConnectorCollapsibleCard
      idBase="workspace-infomaniak-mail"
      icon={<InfomaniakBrandIcon compact />}
      copy={{
        title: t("sources.infomaniakMailTitle"),
        srHeading: t("queue.infomaniakMailWorkspaceHeading"),
        includeInRunLabel: t("queue.workspaceIncludeInfomaniakMailInRun"),
        openExternalSourcesLabel: t("queue.infomaniakMailOpenExternalSources"),
        notConnectedLabel: t("queue.infomaniakMailWorkspaceNotConnected"),
        connectUnderSourcesLabel: t("queue.infomaniakMailConnectUnderSources"),
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
            {t("queue.infomaniakMailWorkspaceSectionFilters")}
          </span>
          <span className={WORKSPACE_CONNECTOR_SUBSECTION_HINT_CLASS}>
            {t("queue.infomaniakMailWorkspaceSectionFiltersHint")}
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
                onChange={(e) => setDateFilter(e.target.value as InfomaniakMailDateFilter)}
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
        </WorkspaceConnectorFormGrid>
      </div>
    </WorkspaceConnectorCollapsibleCard>
  );
}
