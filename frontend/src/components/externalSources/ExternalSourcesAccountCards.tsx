import { useMemo, useCallback } from "react";
import { EXTERNAL_SOURCE_CONNECTORS } from "../../externalSources/connectors";
import { EXTERNAL_SOURCE_ACCOUNT_GROUPS } from "../../externalSources/externalSourceAccountGroups";
import { externalSourceBrandIcon } from "../../externalSources/ExternalSourceBrandIcons";
import { useI18n } from "../../i18n/I18nContext";
import { queueChatDraft } from "../../utils/deferredPanelActions";
import GoogleConnectAllButton from "./GoogleConnectAllButton";
import InfomaniakConnectAllButton from "./InfomaniakConnectAllButton";
import MicrosoftConnectAllButton from "./MicrosoftConnectAllButton";
import { EXTERNAL_SOURCE_CARD_TAG_GUTTER_CLASS } from "./ExternalSourceCard";

interface ExternalSourcesAccountCardsProps {
  backendOnline: boolean;
  /** Welcome setup: compact connector cards without developer/setup copy. */
  compact?: boolean;
  onOpenAssistantWithDraft?: (text: string) => void;
}

/**
 * Third-party account cards grouped by vendor — External sources tab and welcome flow.
 */
export function ExternalSourcesAccountCards({
  backendOnline,
  compact = false,
  onOpenAssistantWithDraft,
}: ExternalSourcesAccountCardsProps) {
  const { t } = useI18n();

  const openAssistant = useCallback(
    (text: string) => {
      if (onOpenAssistantWithDraft) {
        onOpenAssistantWithDraft(text);
        return;
      }
      queueChatDraft(text, "assistant");
    },
    [onOpenAssistantWithDraft],
  );

  const connectorById = useMemo(
    () => new Map(EXTERNAL_SOURCE_CONNECTORS.map((c) => [c.id, c])),
    []
  );

  return (
    <div className={compact ? "space-y-6" : "space-y-12"}>
      {EXTERNAL_SOURCE_ACCOUNT_GROUPS.map((group) => (
        <section
          key={group.groupId}
          aria-labelledby={`sources-group-heading-${group.groupId}`}
          className="space-y-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id={`sources-group-heading-${group.groupId}`}
              className="text-base font-semibold tracking-tight text-text-primary"
            >
              {t(`sources.${group.titleKey}`)}
            </h2>
            {group.groupId === "google" ? <GoogleConnectAllButton /> : null}
            {group.groupId === "infomaniak" ? <InfomaniakConnectAllButton /> : null}
            {group.groupId === "microsoft" ? <MicrosoftConnectAllButton /> : null}
          </div>
          <div
            className={
              compact
                ? "grid grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] gap-x-5 gap-y-4"
                : "grid grid-cols-[repeat(auto-fill,minmax(min(100%,24rem),1fr))] gap-x-6 gap-y-5"
            }
          >
            {group.connectorIds.map((id) => {
              const connector = connectorById.get(id);
              if (!connector) return null;
              return (
                <div
                  key={id}
                  className={`relative min-w-0 w-full overflow-visible ${EXTERNAL_SOURCE_CARD_TAG_GUTTER_CLASS}`}
                >
                  {connector.renderAccountCard({
                    backendOnline,
                    brandIcon: externalSourceBrandIcon(connector.id),
                    compact,
                    onOpenAssistantWithDraft: openAssistant,
                  })}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
