import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  gmailImportSort,
  gmailStatus,
  type GmailImportContent,
} from "../../api/gmail";
import type { AppSettings } from "../../types/settings";
import { effectiveMinConfidenceForJob } from "../../utils/automationPreset";
import {
  WORKSPACE_CONNECTOR_CARD_SHELL_CLASS,
  WORKSPACE_CONNECTOR_SUBSECTION_HEADER_CLASS,
  WORKSPACE_CONNECTOR_SUBSECTION_HINT_CLASS,
  WORKSPACE_CONNECTOR_SUBSECTION_TITLE_CLASS,
  WORKSPACE_CONNECTOR_TINTED_PANEL_CLASS,
} from "../../utils/styles";
import { buildGmailQueryFromSelection, parseGmailQueryToSelectionIds } from "../../utils/gmailSearchCategories";
import GmailCategoryMaxRow from "./GmailCategoryMaxRow";
import { WorkspaceSortBlockShell } from "./WorkspaceSortBlockShell";
import { useSyncWorkspaceMergePrefs } from "./useSyncWorkspaceMergePrefs";
import { buildAnalyzeOcrPayload } from "../../utils/tesseractLang";
import { useI18n } from "../../i18n/I18nContext";
import { EntitlementBlockedError } from "../../api/client";
import { formatError } from "../../utils/formatError";
import { GMAIL_EXPORT_MAX_MESSAGES } from "../../constants";
import { GmailBrandIcon } from "../../externalSources/ExternalSourceBrandIcons";
import {
  EXOSITES_GOOGLE_INTEGRATION_CHANGED_EVENT,
  hasElectronBridge,
  notifyGoogleIntegrationChanged,
} from "../../utils/platform";
import { buildGmailJobUiParametersJson } from "../../utils/gmailJobParameters";
import {
  documentBriefingRequestField,
} from "../../utils/sortSystemPromptPayload";
import { sortClassifyPayloadForJob } from "../../utils/sortClassifyPayload";

export type GmailMergePrefs = {
  enabled: boolean;
  gmail_query: string;
  max_messages: number;
  gmail_import_content: GmailImportContent;
};

export interface GmailWorkspaceSortBlockProps {
  settings: AppSettings;
  backendOnline: boolean;
  installedTesseractLangs: string[] | undefined;
  onGmailSortJobStarted: (jobId: string, sessionId: string) => void;
  onGmailMergePrefsChange: (prefs: GmailMergePrefs | null) => void;
  onEntitlementRefresh: () => void | Promise<void>;
  toastEntitlementBlocked: () => void;
  onOpenExternalSourcesTab?: () => void;
  /** When true, the in-card “Sort mail now” button is hidden — use workspace Run instead. */
  hideWorkspacePrimaryImportButton?: boolean;
  /** Registers the mail-only import runner for the workspace batch Run control (desktop). */
  onRegisterWorkspaceGmailMailOnlyRunner?: (
    runner: ((opts?: { signal?: AbortSignal }) => Promise<void>) | null
  ) => void;
}

export default function GmailWorkspaceSortBlock({
  settings,
  backendOnline,
  installedTesseractLangs,
  onGmailSortJobStarted,
  onGmailMergePrefsChange,
  onEntitlementRefresh,
  toastEntitlementBlocked,
  onOpenExternalSourcesTab,
  hideWorkspacePrimaryImportButton = false,
  onRegisterWorkspaceGmailMailOnlyRunner,
}: GmailWorkspaceSortBlockProps) {
  const { t } = useI18n();
  const desktop = hasElectronBridge();
  const priorConnectedRef = useRef(false);
  const [connected, setConnected] = useState(false);
  const [oauthConfigured, setOauthConfigured] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [importBusy, setImportBusy] = useState(false);
  const [sectionOpen, setSectionOpen] = useState(false);
  const [query, setQuery] = useState("in:anywhere");
  const [maxMessages, setMaxMessages] = useState(GMAIL_EXPORT_MAX_MESSAGES);
  const [importMaxCap, setImportMaxCap] = useState(GMAIL_EXPORT_MAX_MESSAGES);
  const [importContent, setImportContent] = useState<GmailImportContent>("both");
  const [mergeIntoNextLocalSort, setMergeIntoNextLocalSort] = useState(false);

  const refreshStatus = useCallback(async () => {
    if (!backendOnline) {
      setLoadingStatus(false);
      return;
    }
    setLoadingStatus(true);
    try {
      const s = await gmailStatus();
      setConnected(s.connected);
      setOauthConfigured(s.oauth_configured);
      if (desktop && s.connected && !priorConnectedRef.current) {
        notifyGoogleIntegrationChanged();
      }
      priorConnectedRef.current = s.connected;
      const cap = s.gmail_import_max_messages;
      if (typeof cap === "number" && Number.isFinite(cap) && cap >= 1) {
        setImportMaxCap(Math.min(GMAIL_EXPORT_MAX_MESSAGES, Math.max(1, Math.round(cap))));
      }
    } catch {
      setConnected(false);
      setOauthConfigured(false);
      priorConnectedRef.current = false;
    } finally {
      setLoadingStatus(false);
    }
  }, [backendOnline, desktop]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!desktop) return;
    const onGoogleIntegrationChanged = () => {
      void refreshStatus();
    };
    window.addEventListener(EXOSITES_GOOGLE_INTEGRATION_CHANGED_EVENT, onGoogleIntegrationChanged);
    return () =>
      window.removeEventListener(EXOSITES_GOOGLE_INTEGRATION_CHANGED_EVENT, onGoogleIntegrationChanged);
  }, [desktop, refreshStatus]);

  useEffect(() => {
    setMaxMessages((m) => Math.min(m, importMaxCap));
  }, [importMaxCap]);

  const mergePayload = useCallback((): GmailMergePrefs | null => {
    if (!mergeIntoNextLocalSort || !connected || !oauthConfigured) return null;
    return {
      enabled: true,
      gmail_query: buildGmailQueryFromSelection(parseGmailQueryToSelectionIds(query)),
      max_messages: Math.min(importMaxCap, Math.max(1, maxMessages)),
      gmail_import_content: importContent,
    };
  }, [mergeIntoNextLocalSort, connected, oauthConfigured, query, maxMessages, importContent, importMaxCap]);

  useSyncWorkspaceMergePrefs(onGmailMergePrefsChange, mergePayload);

  const statusLine = useMemo(() => {
    if (loadingStatus) return t("sources.gmailLoadingStatus");
    if (!oauthConfigured) return t("queue.workspaceGmailSummarySetup");
    if (!connected) return t("queue.workspaceGmailSummaryDisconnected");
    return t("queue.workspaceGmailSummaryConnected");
  }, [loadingStatus, oauthConfigured, connected, t]);

  const needsExternalSources = !oauthConfigured || !connected;
  const disabledBlock = !oauthConfigured || loadingStatus;
  const canUseGmail = backendOnline && connected && oauthConfigured && !loadingStatus;

  const runMailImport = useCallback(async (signal?: AbortSignal) => {
    if (!backendOnline || !settings.outputDir?.trim()) {
      toast.message(t("queue.gmailNeedOutputDir"));
      return;
    }
    setImportBusy(true);
    try {
      const ocr = buildAnalyzeOcrPayload(settings, installedTesseractLangs);
      const { job_id, session_id } = await gmailImportSort(
        {
          gmail_query: buildGmailQueryFromSelection(parseGmailQueryToSelectionIds(query)),
          max_messages: Math.min(importMaxCap, Math.max(1, maxMessages)),
          gmail_import_content: importContent,
          gmail_ui_parameters_json: buildGmailJobUiParametersJson({
            query,
            maxMessages: Math.min(importMaxCap, Math.max(1, maxMessages)),
            importMaxCap,
            importContent,
          }),
          output_dir: settings.outputDir,
          model: settings.model,
          mode: settings.mode,
          language: settings.language,
          vision_model: settings.visionModel.trim() || undefined,
          rules: settings.rules.filter((r) => r.enabled && r.pattern.trim()),
          on_collision: settings.onCollision,
          min_confidence: effectiveMinConfidenceForJob(settings),
          ...ocr,
          ...sortClassifyPayloadForJob(settings),
          ...documentBriefingRequestField(settings),
        },
        { signal }
      );
      onGmailSortJobStarted(job_id, session_id);
      toast.message(t("queue.gmailImportStarted"));
    } catch (e) {
      if (signal?.aborted) return;
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (e instanceof EntitlementBlockedError) {
        toastEntitlementBlocked();
        void onEntitlementRefresh();
        return;
      }
      const msg = formatError(e);
      const capMatch = msg.match(/less than or equal to (\d+)/i);
      if (capMatch) {
        const serverCap = Math.min(GMAIL_EXPORT_MAX_MESSAGES, Math.max(1, parseInt(capMatch[1], 10)));
        setImportMaxCap(serverCap);
        setMaxMessages((m) => Math.min(m, serverCap));
        toast.error(t("queue.gmailImportFailed"), {
          description: `${msg}\n\n${t("queue.gmailImportCapAdapted", { cap: serverCap })}`,
        });
      } else {
        toast.error(t("queue.gmailImportFailed"), { description: msg });
      }
    } finally {
      setImportBusy(false);
    }
  }, [
    backendOnline,
    settings,
    installedTesseractLangs,
    query,
    maxMessages,
    importMaxCap,
    importContent,
    onGmailSortJobStarted,
    t,
    toastEntitlementBlocked,
    onEntitlementRefresh,
  ]);

  useEffect(() => {
    if (!onRegisterWorkspaceGmailMailOnlyRunner) return;
    onRegisterWorkspaceGmailMailOnlyRunner((opts) => runMailImport(opts?.signal));
    return () => onRegisterWorkspaceGmailMailOnlyRunner(null);
  }, [onRegisterWorkspaceGmailMailOnlyRunner, runMailImport]);

  const mergeToggleDisabled = !backendOnline || !connected || disabledBlock;

  return (
    <WorkspaceSortBlockShell id="workspace-gmail" aria-labelledby="workspace-gmail-heading">
      <label
        className={`flex shrink-0 items-center self-center pl-0.5 ${
          mergeToggleDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
        }`}
        title={t("queue.workspaceIncludeGmailInRun")}
      >
        <input
          type="checkbox"
          className="accent-accent h-4 w-4 shrink-0 rounded border-border"
          checked={mergeIntoNextLocalSort}
          disabled={mergeToggleDisabled}
          aria-label={t("queue.workspaceIncludeGmailInRun")}
          onChange={(e) => setMergeIntoNextLocalSort(e.target.checked)}
        />
      </label>

      <div className={WORKSPACE_CONNECTOR_CARD_SHELL_CLASS}>
        <h2 id="workspace-gmail-heading" className="sr-only">
          {t("queue.workspaceGmailHeading")}
        </h2>

        <button
          type="button"
          className="w-full flex items-center gap-3 p-4 text-left hover:bg-bg-secondary/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
          onClick={() => setSectionOpen((o) => !o)}
          aria-expanded={sectionOpen}
          aria-controls="workspace-gmail-panel"
          id="workspace-gmail-toggle"
          aria-label={`${t("sources.gmailTitle")} — ${t("queue.workspaceGmailHeading")}`}
        >
          <GmailBrandIcon compact />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-text-primary">{t("sources.gmailTitle")}</span>
              {!loadingStatus && oauthConfigured && (
                <span
                  className={`text-2xs font-medium px-2 py-0.5 rounded-full ${
                    connected ? "bg-success-soft text-success" : "bg-bg-secondary text-muted border border-border"
                  }`}
                >
                  {connected ? t("queue.gmailStatusPillReady") : t("queue.gmailStatusPillOff")}
                </span>
              )}
              {!loadingStatus && !oauthConfigured && (
                <span className="text-2xs font-medium px-2 py-0.5 rounded-full bg-warning-soft text-warning">
                  {t("queue.gmailStatusPillSetup")}
                </span>
              )}
            </div>
            {(loadingStatus || !oauthConfigured || !connected) && (
              <p className="text-2xs text-muted mt-0.5 leading-snug truncate">{statusLine}</p>
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
            id="workspace-gmail-panel"
            role="region"
            aria-labelledby="workspace-gmail-toggle"
            className="px-4 pb-4 pt-3 space-y-4 border-t border-border"
          >
            {needsExternalSources && onOpenExternalSourcesTab ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenExternalSourcesTab();
                }}
                className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium border border-accent-line bg-accent-light text-accent hover:bg-accent-light/80 transition-colors"
              >
                {t("queue.gmailOpenExternalSources")}
              </button>
            ) : needsExternalSources ? (
              <p className="text-xs text-muted leading-relaxed">
                {!oauthConfigured || loadingStatus
                  ? t("queue.workspaceGmailConnectHint")
                  : t("queue.workspaceGmailNotConnected")}
              </p>
            ) : null}

            {!needsExternalSources && (
              <div className="space-y-3">
                <div className={WORKSPACE_CONNECTOR_TINTED_PANEL_CLASS}>
                  <div className={WORKSPACE_CONNECTOR_SUBSECTION_HEADER_CLASS}>
                    <span className={WORKSPACE_CONNECTOR_SUBSECTION_TITLE_CLASS}>{t("queue.gmailImportOptionsToggle")}</span>
                    <span className={WORKSPACE_CONNECTOR_SUBSECTION_HINT_CLASS}>{t("queue.gmailImportOptionsHint")}</span>
                  </div>
                  <GmailCategoryMaxRow
                    query={query}
                    onQueryChange={setQuery}
                    maxMessages={maxMessages}
                    onMaxMessagesChange={setMaxMessages}
                    importMaxCap={importMaxCap}
                    importContent={importContent}
                    onImportContentChange={setImportContent}
                    disabled={!backendOnline || disabledBlock}
                  />
                </div>

                {!hideWorkspacePrimaryImportButton && (
                  <button
                    type="button"
                    disabled={!backendOnline || !canUseGmail || importBusy || !settings.outputDir?.trim()}
                    onClick={() => void runMailImport()}
                    className="w-full px-4 py-2.5 rounded-lg text-sm font-medium bg-button-primary text-white hover:bg-button-hover disabled:opacity-40 disabled:pointer-events-none"
                  >
                    {importBusy ? t("queue.gmailImporting") : t("queue.gmailImportSort")}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </WorkspaceSortBlockShell>
  );
}
