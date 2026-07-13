import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { normalizeModel, findPreset } from "../../utils/modelCatalogue";
import {
  firstInstalledVisionModel,
  isVisionCapableModelName,
  resolveVisionModelClient,
} from "../../utils/visionModels";
import { SECTION_LABEL_CLASS } from "../../utils/styles";
import { inlineErrorMessage } from "../../utils/userGuidance";
import HoverHelpCard from "../ui/HoverHelpCard";
import { useI18n } from "../../i18n/I18nContext";
import { useCloudSortActive } from "../../hooks/useCloudSortActive";
import type { EntitlementStatus } from "../../api";

interface VisionFallbackSectionProps {
  visionModel: string;
  backendOnline: boolean;
  models: string[];
  loadingModels: boolean;
  onOpenVisionModelsSettings?: () => void;
  entitlement?: EntitlementStatus | null;
}

export default function VisionFallbackSection({
  visionModel,
  backendOnline,
  models,
  loadingModels,
  onOpenVisionModelsSettings,
  entitlement,
}: VisionFallbackSectionProps) {
  const { t } = useI18n();
  const { cloudSortActive } = useCloudSortActive(entitlement);
  const [status, setStatus] = useState<{
    resolved: string | null;
    auto_model: string | null;
    installed_vision_models: string[];
  } | null>(null);
  const [statusErr, setStatusErr] = useState<string | null>(null);
  const [statusIsEstimate, setStatusIsEstimate] = useState(false);

  const installedVision = useMemo(
    () => [...models].filter(isVisionCapableModelName).sort((a, b) => a.localeCompare(b)),
    [models]
  );

  const preferenceLabel = useMemo(() => {
    const v = visionModel.trim();
    if (!v) return t("settings.visionScan.preferenceAuto");
    if (
      installedVision.some((m) => m === v || normalizeModel(m) === normalizeModel(v))
    ) {
      return v;
    }
    const preset = findPreset(v);
    if (preset) {
      return t("settings.visionScan.preferenceDetail", {
        model: v,
        sizeGb: preset.sizeGb,
        minRamGb: preset.minRamGb,
      });
    }
    return v;
  }, [visionModel, installedVision, t]);

  useEffect(() => {
    if (!backendOnline || cloudSortActive) {
      setStatus(null);
      setStatusErr(null);
      setStatusIsEstimate(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const pref = visionModel.trim() || undefined;
      const installedSorted = [...models]
        .filter(isVisionCapableModelName)
        .sort((a, b) => a.localeCompare(b));
      const fallbackStatus = () => ({
        installed_vision_models: installedSorted,
        auto_model: firstInstalledVisionModel(models),
        resolved: resolveVisionModelClient(models, pref ?? null),
      });
      try {
        const r = await api.visionStatus(pref);
        if (!cancelled) {
          setStatus(r);
          setStatusErr(null);
          setStatusIsEstimate(false);
        }
      } catch (e) {
        if (!cancelled) {
          const msg = inlineErrorMessage(e);
          const missingRoute = /not\s*found|\b404\b/i.test(msg);
          setStatus(fallbackStatus());
          setStatusIsEstimate(true);
          setStatusErr(missingRoute ? null : msg);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backendOnline, visionModel, models, loadingModels, cloudSortActive]);

  return (
    <div className="px-4 py-3 border-t border-border space-y-3">
      <HoverHelpCard
        hint={cloudSortActive ? t("settings.visionScan.cloudSortOcrOnly") : t("settings.visionScan.hint")}
        className="space-y-2"
      >
        <div>
          <p className={SECTION_LABEL_CLASS}>{t("settings.visionScan.title")}</p>
          <p className="text-sm text-text-primary mt-1 break-words">{preferenceLabel}</p>
          <p className="text-2xs text-muted mt-1 leading-relaxed">{t("settings.visionScan.readOnlyHint")}</p>
          {onOpenVisionModelsSettings && (
            <button
              type="button"
              onClick={onOpenVisionModelsSettings}
              className="mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border bg-bg-secondary text-text-primary hover:bg-hover-overlay transition-colors"
            >
              {t("settings.visionScan.changeButton")}
            </button>
          )}
        </div>
      </HoverHelpCard>

      <div className="text-2xs space-y-1">
        {!backendOnline && <p className="text-muted">{t("settings.visionScan.connectBackend")}</p>}
        {backendOnline && cloudSortActive && (
          <p className="text-muted leading-relaxed">{t("settings.visionScan.cloudSortOcrOnly")}</p>
        )}
        {backendOnline && !cloudSortActive && status && (
          <>
            {statusIsEstimate && (
              <div className="text-2xs text-muted leading-relaxed border border-border rounded-lg px-2 py-1.5 bg-bg-secondary space-y-2">
                <p>{t("settings.visionScan.apiMissingHint")}</p>
                <details className="group/vis-details">
                  <summary className="cursor-pointer list-none text-accent hover:underline [&::-webkit-details-marker]:hidden flex items-center gap-1">
                    <span className="inline-block transition-transform duration-200 group-open/vis-details:rotate-90 text-muted">
                      ›
                    </span>
                    {t("settings.ocrDetailsTitle")}
                  </summary>
                  <p className="mt-2 pl-4 border-l border-border-soft">
                    {t("settings.visionScan.apiMissingHintTechnical")}
                  </p>
                </details>
              </div>
            )}
            <p className="text-muted">
              <span className="text-text-primary font-medium">{t("settings.visionScan.effectiveFor")} </span>
              {status.resolved ? (
                <span className="font-mono text-text-primary">{status.resolved}</span>
              ) : (
                <span className="text-warning">{t("settings.visionScan.noneAddVision")}</span>
              )}
            </p>
            {status.auto_model && (
              <p className="text-muted opacity-80">
                {t("settings.visionScan.autoPickWouldBe", { model: status.auto_model })}
              </p>
            )}
          </>
        )}
        {statusErr && (
          <p className="text-error">{t("settings.visionScan.statusError", { detail: statusErr })}</p>
        )}
      </div>
    </div>
  );
}
