import { useCallback, useMemo, useState } from "react";
import type { AppSettings } from "../../types/settings";
import {
  WORKSPACE_CONNECTOR_FILTERS_ONLY_PANEL_CLASS,
  WORKSPACE_CONNECTOR_SUBSECTION_HEADER_CLASS,
  WORKSPACE_CONNECTOR_SUBSECTION_HINT_CLASS,
  WORKSPACE_CONNECTOR_SUBSECTION_TITLE_CLASS,
} from "../../utils/styles";
import { useI18n } from "../../i18n/I18nContext";
import { useWorkspaceConnectorAccount } from "../../hooks/useWorkspaceConnectorAccount";
import { InfomaniakBrandIcon } from "../../externalSources/ExternalSourceBrandIcons";
import { INFOMANIAK_DRIVE_INTEGRATION_CHANGED_EVENT } from "../externalSources/infomaniakIntegrationEvents";
import type { WorkspaceFileTypeCategory } from "./workspaceFileTypeCategories";
import { defaultWorkspaceFileTypeCategories } from "./workspaceFileTypeCategories";
import WorkspaceConnectorTypeCheckboxes from "./WorkspaceConnectorTypeCheckboxes";
import { WorkspaceConnectorFieldColumn, WorkspaceConnectorFormGrid } from "./WorkspaceConnectorFormGrid";
import { WorkspaceConnectorCollapsibleCard } from "./WorkspaceConnectorCollapsibleCard";
import { WorkspaceSortBlockShell } from "./WorkspaceSortBlockShell";
import { useSyncWorkspaceMergePrefs } from "./useSyncWorkspaceMergePrefs";

export type InfomaniakMergePrefs = {
  enabled: boolean;
  driveId: string;
  typeCategories: WorkspaceFileTypeCategory[];
};

export interface InfomaniakWorkspaceSortBlockProps {
  settings: AppSettings;
  backendOnline: boolean;
  onInfomaniakMergePrefsChange: (prefs: InfomaniakMergePrefs | null) => void;
  onOpenExternalSourcesTab?: () => void;
  hideWorkspacePrimaryImportButton?: boolean;
}

export default function InfomaniakWorkspaceSortBlock({
  settings: _settings,
  backendOnline,
  onInfomaniakMergePrefsChange,
  onOpenExternalSourcesTab,
  hideWorkspacePrimaryImportButton: _hide,
}: InfomaniakWorkspaceSortBlockProps) {
  void _settings;
  void _hide;
  const { t } = useI18n();
  const [sectionOpen, setSectionOpen] = useState(false);
  const [includeInRun, setIncludeInRun] = useState(false);
  const [typeCategories, setTypeCategories] = useState<WorkspaceFileTypeCategory[]>(() =>
    defaultWorkspaceFileTypeCategories()
  );

  const { desktop, connected, oauthConfigured, loadingStatus } = useWorkspaceConnectorAccount({
    providerId: "infomaniak",
    integrationChangedEvent: INFOMANIAK_DRIVE_INTEGRATION_CHANGED_EVENT,
  });

  const mergePayload = useCallback((): InfomaniakMergePrefs | null => {
    if (!includeInRun || !connected) return null;
    return { enabled: true, driveId: "", typeCategories };
  }, [includeInRun, connected, typeCategories]);

  useSyncWorkspaceMergePrefs(onInfomaniakMergePrefsChange, mergePayload);

  const needsExternal = !desktop || !oauthConfigured || !connected;
  const accountBusy = !backendOnline || !connected || loadingStatus;

  const summaryLine = useMemo(() => {
    if (!desktop) return t("queue.infomaniakWorkspaceElectronOnly");
    if (loadingStatus) return t("sources.infomaniakTitle");
    if (!oauthConfigured) return t("queue.infomaniakWorkspaceOauthSetup");
    if (!connected) return t("queue.infomaniakWorkspaceNotConnected");
    return t("queue.infomaniakWorkspaceRunUsesFilters");
  }, [desktop, loadingStatus, oauthConfigured, connected, t]);

  if (!desktop) {
    return (
      <WorkspaceSortBlockShell id="workspace-infomaniak" aria-label={t("sources.infomaniakTitle")}>
        <div className="w-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1 rounded-xl border border-border bg-bg-card/60 p-4 text-sm text-muted">
          {t("queue.infomaniakWorkspaceElectronOnly")}
        </div>
      </WorkspaceSortBlockShell>
    );
  }

  return (
    <WorkspaceConnectorCollapsibleCard
      idBase="workspace-infomaniak"
      icon={<InfomaniakBrandIcon compact />}
      copy={{
        title: t("sources.infomaniakTitle"),
        srHeading: t("queue.infomaniakWorkspaceHeading"),
        includeInRunLabel: t("queue.workspaceIncludeInfomaniakInRun"),
        openExternalSourcesLabel: t("queue.infomaniakOpenExternalSources"),
        notConnectedLabel: t("queue.infomaniakWorkspaceNotConnected"),
        connectUnderSourcesLabel: t("queue.infomaniakConnectUnderSources"),
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
            {t("queue.infomaniakWorkspaceSectionFilters")}
          </span>
          <span className={WORKSPACE_CONNECTOR_SUBSECTION_HINT_CLASS}>
            {t("queue.infomaniakWorkspaceSectionFiltersHint")}
          </span>
        </div>
        <WorkspaceConnectorFormGrid>
          <WorkspaceConnectorFieldColumn label={t("queue.workspaceFileTypes")}>
            <WorkspaceConnectorTypeCheckboxes
              value={typeCategories}
              onChange={setTypeCategories}
              disabled={accountBusy}
            />
          </WorkspaceConnectorFieldColumn>
        </WorkspaceConnectorFormGrid>
      </div>
    </WorkspaceConnectorCollapsibleCard>
  );
}
