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
import { DropboxBrandIcon } from "../../externalSources/ExternalSourceBrandIcons";
import { DROPBOX_INTEGRATION_CHANGED_EVENT } from "../externalSources/DropboxConnectionSection";
import type { DropboxDateFilter, DropboxSortOption } from "./dropboxWorkspaceListFilter";
import type { WorkspaceFileTypeCategory } from "./workspaceFileTypeCategories";
import { defaultWorkspaceFileTypeCategories } from "./workspaceFileTypeCategories";
import WorkspaceConnectorTypeCheckboxes from "./WorkspaceConnectorTypeCheckboxes";
import { WorkspaceConnectorFieldColumn, WorkspaceConnectorFormGrid } from "./WorkspaceConnectorFormGrid";
import { WorkspaceSortBlockShell } from "./WorkspaceSortBlockShell";
import { WorkspaceConnectorCollapsibleCard } from "./WorkspaceConnectorCollapsibleCard";
import { useSyncWorkspaceMergePrefs } from "./useSyncWorkspaceMergePrefs";

export type DropboxMergePrefs = {
  enabled: boolean;
  /** Dropbox path (empty string = root). */
  path: string;
  typeCategories: WorkspaceFileTypeCategory[];
  dateFilter: DropboxDateFilter;
  sinceDate: string;
  sortOption: DropboxSortOption;
};

export interface DropboxWorkspaceSortBlockProps {
  settings: AppSettings;
  backendOnline: boolean;
  onDropboxMergePrefsChange: (prefs: DropboxMergePrefs | null) => void;
  onOpenExternalSourcesTab?: () => void;
  hideWorkspacePrimaryImportButton?: boolean;
}

const DROPBOX_WORKSPACE_ROOT_PATH = "" as const;

/**
 * Workspace block: Dropbox filter dropdowns. Runs sort imports from the root of the user's
 * Dropbox (recursively) matching the chosen filters.
 */
export default function DropboxWorkspaceSortBlock({
  settings: _settings,
  backendOnline,
  onDropboxMergePrefsChange,
  onOpenExternalSourcesTab,
  hideWorkspacePrimaryImportButton: _hideWorkspacePrimaryImportButton,
}: DropboxWorkspaceSortBlockProps) {
  void _settings;
  void _hideWorkspacePrimaryImportButton;
  const { t } = useI18n();
  const filterFormId = useId();
  const filterDateId = `${filterFormId}-date`;
  const filterSinceId = `${filterFormId}-since`;
  const filterSortId = `${filterFormId}-sort`;
  const [sectionOpen, setSectionOpen] = useState(false);
  const [includeInRun, setIncludeInRun] = useState(false);
  const [typeCategories, setTypeCategories] = useState<WorkspaceFileTypeCategory[]>(() =>
    defaultWorkspaceFileTypeCategories()
  );
  const [dateFilter, setDateFilter] = useState<DropboxDateFilter>("any");
  const [sinceDate, setSinceDate] = useState("");
  const [sortOption, setSortOption] = useState<DropboxSortOption>("name");

  const { desktop, connected, oauthConfigured, loadingStatus } = useWorkspaceConnectorAccount({
    providerId: "dropbox",
    integrationChangedEvent: DROPBOX_INTEGRATION_CHANGED_EVENT,
  });

  const mergePayload = useCallback((): DropboxMergePrefs | null => {
    if (!includeInRun || !connected) return null;
    return {
      enabled: true,
      path: DROPBOX_WORKSPACE_ROOT_PATH,
      typeCategories,
      dateFilter,
      sinceDate,
      sortOption,
    };
  }, [includeInRun, connected, typeCategories, dateFilter, sinceDate, sortOption]);

  useSyncWorkspaceMergePrefs(onDropboxMergePrefsChange, mergePayload);

  const needsExternal = !desktop || !oauthConfigured || !connected;
  const accountBusy = !backendOnline || !connected || loadingStatus;

  const summaryLine = useMemo(() => {
    if (!desktop) return t("queue.dropboxWorkspaceElectronOnly");
    if (loadingStatus) return t("sources.dropboxTitle");
    if (!oauthConfigured) return t("queue.dropboxWorkspaceOauthSetup");
    if (!connected) return t("queue.dropboxWorkspaceNotConnected");
    return t("queue.dropboxWorkspaceRunUsesFilters");
  }, [desktop, loadingStatus, oauthConfigured, connected, t]);

  if (!desktop) {
    return (
      <WorkspaceSortBlockShell id="workspace-dropbox" aria-label={t("sources.dropboxTitle")}>
        <div className="w-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1 rounded-xl border border-border bg-bg-card/60 p-4 text-sm text-muted">
          {t("queue.dropboxWorkspaceElectronOnly")}
        </div>
      </WorkspaceSortBlockShell>
    );
  }

  return (
    <WorkspaceConnectorCollapsibleCard
      idBase="workspace-dropbox"
      icon={<DropboxBrandIcon compact />}
      copy={{
        title: t("sources.dropboxTitle"),
        srHeading: t("queue.dropboxWorkspaceHeading"),
        includeInRunLabel: t("queue.workspaceIncludeDropboxInRun"),
        openExternalSourcesLabel: t("queue.dropboxOpenExternalSources"),
        notConnectedLabel: t("queue.dropboxWorkspaceNotConnected"),
        connectUnderSourcesLabel: t("queue.dropboxConnectUnderSources"),
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
            {t("queue.dropboxWorkspaceSectionFilters")}
          </span>
          <span className={WORKSPACE_CONNECTOR_SUBSECTION_HINT_CLASS}>
            {t("queue.dropboxWorkspaceSectionFiltersHint")}
          </span>
        </div>
        <WorkspaceConnectorFormGrid>
          <WorkspaceConnectorFieldColumn column={1} label={t("queue.driveFilterType")}>
            <WorkspaceConnectorTypeCheckboxes
              value={typeCategories}
              onChange={setTypeCategories}
              disabled={accountBusy}
            />
          </WorkspaceConnectorFieldColumn>
          <WorkspaceConnectorFieldColumn column={2} label={t("queue.driveFilterDate")} htmlFor={filterDateId}>
            <div className="flex flex-wrap items-end gap-2 w-full min-w-0">
              <select
                id={filterDateId}
                className={`${WORKSPACE_CONNECTOR_SELECT_CLASS} min-w-0 flex-1 basis-[8rem] sm:min-w-0`}
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as DropboxDateFilter)}
                disabled={accountBusy}
              >
                <option value="any">{t("queue.driveFilterDateAny")}</option>
                <option value="7d">{t("queue.driveFilterDate7d")}</option>
                <option value="30d">{t("queue.driveFilterDate30d")}</option>
                <option value="since">{t("queue.driveFilterDateSince")}</option>
              </select>
              {dateFilter === "since" ? (
                <div className="flex items-center gap-1.5 shrink-0 min-w-0">
                  <label
                    htmlFor={filterSinceId}
                    className="text-2xs font-semibold text-muted uppercase tracking-wider whitespace-nowrap"
                  >
                    {t("queue.driveFilterDateFrom")}
                  </label>
                  <input
                    id={filterSinceId}
                    type="date"
                    className={`${WORKSPACE_CONNECTOR_CONTROL_CLASS} w-[min(100%,10.5rem)] min-w-0 h-10 py-0 shrink-0`}
                    value={sinceDate}
                    onChange={(e) => setSinceDate(e.target.value)}
                    disabled={accountBusy}
                  />
                </div>
              ) : null}
            </div>
          </WorkspaceConnectorFieldColumn>
          <WorkspaceConnectorFieldColumn column={3} label={t("queue.driveFilterSort")} htmlFor={filterSortId}>
            <select
              id={filterSortId}
              className={WORKSPACE_CONNECTOR_SELECT_CLASS}
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as DropboxSortOption)}
              disabled={accountBusy}
            >
              <option value="name">{t("queue.driveFilterSortName")}</option>
              <option value="modifiedDesc">{t("queue.driveFilterSortModified")}</option>
            </select>
          </WorkspaceConnectorFieldColumn>
        </WorkspaceConnectorFormGrid>
      </div>
    </WorkspaceConnectorCollapsibleCard>
  );
}
