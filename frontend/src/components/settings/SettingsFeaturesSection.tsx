import { useEffect } from "react";
import type { AppSettings } from "../../types/settings";
import { SECTION_LABEL_CLASS } from "../../utils/styles";
import { useI18n } from "../../i18n/I18nContext";
import { useConnectedIntegrationIds } from "../../hooks/useConnectedIntegrationIds";
import { isAssistantIntegrationProviderConnected } from "../../utils/assistantIntegrationProviders";
import type { AssistantIntegrationProviderKey } from "../../systemCommands/catalog/types";
import {
  ASSISTANT_FEATURE_UI_SECTIONS,
  assistantFeatureDefinition,
  assistantFeatureNeedsHighRiskConfirm,
  isAssistantFeatureEnabled,
  toggleAssistantFeatureInstall,
  type AssistantFeatureId,
} from "../../systemCommands/assistantFeatureCatalog";

interface SettingsFeaturesSectionProps {
  settings: AppSettings;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
  onOpenSourcesTab?: () => void;
}

type AccessLevel = "read" | "readWrite";

const PROVIDER_LABEL_KEYS: Record<AssistantIntegrationProviderKey, string> = {
  microsoft: "settings.assistantProviderMicrosoftShort",
  google: "settings.assistantProviderGoogleShort",
  infomaniak: "settings.assistantProviderInfomaniakShort",
};

function FeatureCard({
  featureId,
  settings,
  onSettingsPatch,
  onOpenSourcesTab,
}: {
  featureId: AssistantFeatureId;
  settings: AppSettings;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
  onOpenSourcesTab?: () => void;
}) {
  const { t } = useI18n();
  const { connectedIds, loading } = useConnectedIntegrationIds();
  const feature = assistantFeatureDefinition(featureId);
  const enabled = isAssistantFeatureEnabled(settings.assistantInstalledToolIds, featureId);
  const masterOff = !settings.assistantToolsEnabled;

  const providers = feature?.providers ?? [];
  const connectedCount =
    connectedIds && !loading
      ? providers.filter((p) => isAssistantIntegrationProviderConnected(p, connectedIds)).length
      : 0;
  const needsConnection = providers.length > 0;

  return (
    <div className="rounded-xl border border-border bg-bg-secondary/40 px-4 py-3">
      <label
        className={`flex items-start gap-3 ${masterOff ? "pointer-events-none opacity-45" : "cursor-pointer"}`}
      >
        <input
          type="checkbox"
          className="mt-1 rounded border-border text-accent focus:ring-accent shrink-0"
          checked={enabled}
          disabled={masterOff}
          onChange={(e) => {
            const next = toggleAssistantFeatureInstall(
              settings.assistantInstalledToolIds,
              featureId,
              e.target.checked
            );
            onSettingsPatch({ assistantInstalledToolIds: next });
          }}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-text-primary">
              {t(`settings.features.${featureId}.title`)}
            </span>
            {assistantFeatureNeedsHighRiskConfirm(featureId) ? (
              <span className="inline-flex items-center rounded-md bg-accent/15 px-2 py-0.5 text-2xs font-medium text-accent">
                {t("settings.assistantToolRiskBadgeHigh")}
              </span>
            ) : null}
          </span>
          <span className="mt-1 block text-xs leading-snug text-muted">
            {t(`settings.features.${featureId}.body`)}
          </span>
          {needsConnection ? (
            <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-muted">
              {providers.map((provider) => {
                const connected =
                  connectedIds !== null &&
                  !loading &&
                  isAssistantIntegrationProviderConnected(provider, connectedIds);
                return (
                  <span
                    key={provider}
                    className={
                      connected
                        ? "text-emerald-600 dark:text-emerald-400 font-medium"
                        : undefined
                    }
                  >
                    {t(PROVIDER_LABEL_KEYS[provider])}
                    {connected ? ` · ${t("settings.assistantProviderConnected")}` : ""}
                  </span>
                );
              })}
              {onOpenSourcesTab && connectedCount < providers.length ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    onOpenSourcesTab();
                  }}
                  className="text-accent hover:underline font-medium"
                >
                  {t("settings.features.manageAccounts")} →
                </button>
              ) : null}
            </span>
          ) : null}
        </span>
      </label>
    </div>
  );
}

/**
 * Features tab — what agents can do (outcome-first capability toggles, no per-service install list).
 */
export default function SettingsFeaturesSection({
  settings,
  onSettingsPatch,
  onOpenSourcesTab,
}: SettingsFeaturesSectionProps) {
  const { t } = useI18n();
  const master = settings.assistantToolsEnabled;

  useEffect(() => {
    if (!master) return;
    if (!settings.assistantToolsReadEnabled && !settings.assistantToolsWriteEnabled) {
      onSettingsPatch({ assistantToolsReadEnabled: true });
    }
    if (!settings.assistantToolsReadEnabled && settings.assistantToolsWriteEnabled) {
      onSettingsPatch({ assistantToolsReadEnabled: true });
    }
  }, [
    master,
    settings.assistantToolsReadEnabled,
    settings.assistantToolsWriteEnabled,
    onSettingsPatch,
  ]);

  const accessLevel: AccessLevel =
    settings.assistantToolsReadEnabled && settings.assistantToolsWriteEnabled ? "readWrite" : "read";

  const setAccessLevel = (level: AccessLevel) => {
    if (level === "read") {
      onSettingsPatch({ assistantToolsReadEnabled: true, assistantToolsWriteEnabled: false });
    } else {
      onSettingsPatch({ assistantToolsReadEnabled: true, assistantToolsWriteEnabled: true });
    }
  };

  return (
    <section id="settings-features" className="space-y-6 scroll-mt-24">
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-bg-secondary/40 px-3 py-3 group">
        <input
          type="checkbox"
          className="mt-0.5 rounded border-border text-accent focus:ring-accent"
          checked={master}
          onChange={(e) => onSettingsPatch({ assistantToolsEnabled: e.target.checked })}
        />
        <span>
          <span className={`${SECTION_LABEL_CLASS} mb-0`}>{t("settings.assistantMasterLabel")}</span>
          <span className="mt-1 block text-xs leading-snug text-muted">{t("settings.featuresMasterHint")}</span>
        </span>
      </label>

      <fieldset disabled={!master} className={`space-y-5 ${!master ? "pointer-events-none opacity-45" : ""}`}>
        <div>
          <p className={`${SECTION_LABEL_CLASS} mb-2`}>{t("settings.assistantAccessLevelLegend")}</p>
          <div className="space-y-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5 has-[:checked]:border-accent has-[:checked]:bg-accent/5">
              <input
                type="radio"
                className="mt-0.5 border-border text-accent focus:ring-accent"
                name="features-access-level"
                checked={accessLevel === "read"}
                onChange={() => setAccessLevel("read")}
              />
              <span>
                <span className="block text-sm font-medium text-text-primary">
                  {t("settings.assistantAccessReadOption")}
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">
                  {t("settings.assistantAccessReadOptionHint")}
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5 has-[:checked]:border-accent has-[:checked]:bg-accent/5">
              <input
                type="radio"
                className="mt-0.5 border-border text-accent focus:ring-accent"
                name="features-access-level"
                checked={accessLevel === "readWrite"}
                onChange={() => setAccessLevel("readWrite")}
              />
              <span>
                <span className="block text-sm font-medium text-text-primary">
                  {t("settings.assistantAccessReadWriteOption")}
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">
                  {t("settings.assistantAccessReadWriteOptionHint")}
                </span>
              </span>
            </label>
          </div>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-bg-secondary/40 px-3 py-3 group">
          <input
            type="checkbox"
            className="mt-0.5 rounded border-border text-accent focus:ring-accent"
            checked={settings.autonomousMode}
            onChange={(e) => onSettingsPatch({ autonomousMode: e.target.checked })}
          />
          <span>
            <span className={`${SECTION_LABEL_CLASS} mb-0`}>{t("settings.autonomousModeLabel")}</span>
            <span className="mt-1 block text-xs leading-snug text-muted">{t("settings.autonomousModeHint")}</span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-bg-secondary/40 px-3 py-3 group">
          <input
            type="checkbox"
            className="mt-0.5 rounded border-border text-accent focus:ring-accent"
            checked={settings.assistantAgentEnabled}
            onChange={(e) => onSettingsPatch({ assistantAgentEnabled: e.target.checked })}
          />
          <span>
            <span className={`${SECTION_LABEL_CLASS} mb-0`}>{t("settings.assistantAgentLabel")}</span>
            <span className="mt-1 block text-xs leading-snug text-muted">{t("settings.assistantAgentHint")}</span>
          </span>
        </label>

        <div className="space-y-6 pt-2">
          {ASSISTANT_FEATURE_UI_SECTIONS.map(({ sectionKey, featureIds }) => (
            <div key={sectionKey} className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                {t(`settings.features.sections.${sectionKey}`)}
              </h4>
              <div className="space-y-2">
                {featureIds.map((featureId) => (
                  <FeatureCard
                    key={featureId}
                    featureId={featureId}
                    settings={settings}
                    onSettingsPatch={onSettingsPatch}
                    onOpenSourcesTab={onOpenSourcesTab}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
