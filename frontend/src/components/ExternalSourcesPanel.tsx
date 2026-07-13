import { APP_SHELL_GUTTER_X_CLASS } from "../utils/styles";
import { useI18n } from "../i18n/I18nContext";
import OfflineStrip from "./ui/OfflineStrip";
import { ExternalSourcesAccountCards } from "./externalSources/ExternalSourcesAccountCards";
import { queueChatDraft } from "../utils/deferredPanelActions";
import type { MainNavTab } from "../hooks/useMainNavItems";

interface ExternalSourcesPanelProps {
  backendOnline: boolean;
  onRetryBackend?: () => void | Promise<void>;
  requestTab?: (tab: MainNavTab) => void;
}

/**
 * Main tab: connect external accounts (OAuth). Sort/import from sources lives on Workspace.
 */
export default function ExternalSourcesPanel({
  backendOnline,
  onRetryBackend,
  requestTab,
}: ExternalSourcesPanelProps) {
  const { t } = useI18n();

  const openAssistantWithDraft = (text: string) => {
    requestTab?.("assistant");
    queueChatDraft(text, "assistant");
  };

  return (
    <div
      className={`flex-1 min-h-0 flex flex-col overflow-y-auto overflow-x-hidden ${APP_SHELL_GUTTER_X_CLASS} py-6 pb-10`}
    >
      <div className="mx-auto w-full max-w-7xl space-y-8">
        <header className="space-y-1">
          <h1 className="text-lg font-semibold text-text-primary tracking-tight">{t("sources.title")}</h1>
          <p className="text-sm text-muted leading-relaxed">{t("sources.subtitle")}</p>
        </header>

        {!backendOnline ? (
          <OfflineStrip
            message={t("sources.offline")}
            action={
              onRetryBackend
                ? { label: t("offlineStrip.retryApi"), onClick: onRetryBackend }
                : undefined
            }
          />
        ) : null}

        <ExternalSourcesAccountCards
          backendOnline={backendOnline}
          onOpenAssistantWithDraft={requestTab ? openAssistantWithDraft : undefined}
        />
      </div>
    </div>
  );
}
