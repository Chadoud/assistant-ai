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
import { EXOSITES_GOOGLE_INTEGRATION_CHANGED_EVENT } from "../../utils/platform";
import { useWorkspaceConnectorAccount } from "../../hooks/useWorkspaceConnectorAccount";
import { GoogleDriveBrandIcon } from "../../externalSources/ExternalSourceBrandIcons";
import type { DriveDateFilter, DriveSortOption } from "./driveWorkspaceListFilter";
import type { WorkspaceFileTypeCategory } from "./workspaceFileTypeCategories";
import { defaultWorkspaceFileTypeCategories } from "./workspaceFileTypeCategories";
import WorkspaceConnectorTypeCheckboxes from "./WorkspaceConnectorTypeCheckboxes";
import { WorkspaceConnectorFieldColumn, WorkspaceConnectorFormGrid } from "./WorkspaceConnectorFormGrid";
import { WorkspaceSortBlockShell } from "./WorkspaceSortBlockShell";
import { WorkspaceConnectorCollapsibleCard } from "./WorkspaceConnectorCollapsibleCard";
import { useSyncWorkspaceMergePrefs } from "./useSyncWorkspaceMergePrefs";

export type DriveMergePrefs = {
  enabled: boolean;
  parentId: string;
  typeCategories: WorkspaceFileTypeCategory[];
  dateFilter: DriveDateFilter;
  sinceDate: string;
  sortOption: DriveSortOption;
};

export interface DriveWorkspaceSortBlockProps {
  settings: AppSettings;
  backendOnline: boolean;
  onDriveMergePrefsChange: (prefs: DriveMergePrefs | null) => void;
  onOpenExternalSourcesTab?: () => void;
  hideWorkspacePrimaryImportButton?: boolean;
}

/** List children of Drive ``root`` (My Drive) when resolving imports. */
const DRIVE_WORKSPACE_ROOT_PARENT_ID = "root" as const;

/**
 * Workspace block: Google Drive filter dropdowns only. Run sort imports from My Drive that match
 * the filters (see driveWorkspaceImportResolve).
 */
export default function DriveWorkspaceSortBlock({
  settings: _settings,
  backendOnline,
  onDriveMergePrefsChange,
  onOpenExternalSourcesTab,
  hideWorkspacePrimaryImportButton,
}: DriveWorkspaceSortBlockProps) {
  void _settings;
  void hideWorkspacePrimaryImportButton;
  const { t } = useI18n();
  const filterFormId = useId();
  const filterTypeId = `${filterFormId}-type`;
  const filterDateId = `${filterFormId}-date`;
  const filterSinceId = `${filterFormId}-since`;
  const filterSortId = `${filterFormId}-sort`;
  const [sectionOpen, setSectionOpen] = useState(false);
  const [includeInRun, setIncludeInRun] = useState(false);
  const [typeCategories, setTypeCategories] = useState<WorkspaceFileTypeCategory[]>(() =>
    defaultWorkspaceFileTypeCategories()
  );
  const [dateFilter, setDateFilter] = useState<DriveDateFilter>("any");
  const [sinceDate, setSinceDate] = useState("");
  const [sortOption, setSortOption] = useState<DriveSortOption>("name");

  const { desktop, connected, oauthConfigured, loadingStatus } = useWorkspaceConnectorAccount({
    providerId: "google-drive",
    integrationChangedEvent: EXOSITES_GOOGLE_INTEGRATION_CHANGED_EVENT,
  });

  const mergePayload = useCallback((): DriveMergePrefs | null => {
    if (!includeInRun || !connected) return null;
    return {
      enabled: true,
      parentId: DRIVE_WORKSPACE_ROOT_PARENT_ID,
      typeCategories,
      dateFilter,
      sinceDate,
      sortOption,
    };
  }, [includeInRun, connected, typeCategories, dateFilter, sinceDate, sortOption]);

  useSyncWorkspaceMergePrefs(onDriveMergePrefsChange, mergePayload);

  const needsExternal = !desktop || !oauthConfigured || !connected;

  const accountBusy = !backendOnline || !connected || loadingStatus;

  const summaryLine = useMemo(() => {
    if (!desktop) return t("queue.driveWorkspaceElectronOnly");
    if (loadingStatus) return t("sources.driveTitle");
    if (!oauthConfigured) return t("queue.driveWorkspaceOauthSetup");
    if (!connected) return t("queue.driveWorkspaceNotConnected");
    return t("queue.driveWorkspaceRunUsesFilters");
  }, [desktop, loadingStatus, oauthConfigured, connected, t]);

  if (!desktop) {
    return (
      <WorkspaceSortBlockShell id="workspace-drive" aria-label={t("sources.driveTitle")}>
        <div className="w-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1 rounded-xl border border-border bg-bg-card/60 p-4 text-sm text-muted">
          {t("queue.driveWorkspaceElectronOnly")}
        </div>
      </WorkspaceSortBlockShell>
    );
  }

  return (
    <WorkspaceConnectorCollapsibleCard
      idBase="workspace-drive"
      icon={<GoogleDriveBrandIcon compact />}
      copy={{
        title: t("sources.driveTitle"),
        srHeading: t("queue.driveWorkspaceHeading"),
        includeInRunLabel: t("queue.workspaceIncludeDriveInRun"),
        openExternalSourcesLabel: t("queue.driveOpenExternalSources"),
        notConnectedLabel: t("queue.driveWorkspaceNotConnected"),
        connectUnderSourcesLabel: t("queue.driveConnectUnderSources"),
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
            {t("queue.driveWorkspaceSectionFilters")}
          </span>
          <span className={WORKSPACE_CONNECTOR_SUBSECTION_HINT_CLASS}>
            {t("queue.driveWorkspaceSectionFiltersHint")}
          </span>
        </div>
        <WorkspaceConnectorFormGrid>
          <WorkspaceConnectorFieldColumn column={1} label={t("queue.driveFilterType")} htmlFor={filterTypeId}>
            <WorkspaceConnectorTypeCheckboxes
              id={filterTypeId}
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
                onChange={(e) => setDateFilter(e.target.value as DriveDateFilter)}
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
              onChange={(e) => setSortOption(e.target.value as DriveSortOption)}
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
