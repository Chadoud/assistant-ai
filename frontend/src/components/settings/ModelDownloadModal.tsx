import type { UseModelsReturn } from "../../hooks/useModels";
import type { AppSettings } from "../../types/settings";
import type { EntitlementStatus } from "../../api";
import ModalShell from "../ModalShell";
import ModelDownloadBlocks, { type ModelDownloadScope } from "./ModelDownloadBlocks";
import { useI18n } from "../../i18n/I18nContext";
import { useCloudSortActive } from "../../hooks/useCloudSortActive";

type ModelDownloadModalRole = "sort" | "vision";

interface ModelDownloadModalProps {
  open: boolean;
  onClose: () => void;
  role: ModelDownloadModalRole;
  settings: AppSettings;
  modelHook: UseModelsReturn;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
  entitlement?: EntitlementStatus | null;
}

export default function ModelDownloadModal({
  open,
  onClose,
  role,
  settings,
  modelHook,
  onSettingsPatch,
  entitlement,
}: ModelDownloadModalProps) {
  const { t } = useI18n();
  const { cloudSortActive } = useCloudSortActive(entitlement);
  if (!open) return null;

  if (cloudSortActive) {
    return (
      <ModalShell
        title={t("settings.models.downloadModalSortTitle")}
        onClose={onClose}
        maxWidthClass="max-w-lg"
      >
        <div className="px-5 pb-5 pt-2 sm:px-6 text-sm text-text-secondary leading-relaxed">
          {t("remoteLlm.downloadDisabled")}
        </div>
      </ModalShell>
    );
  }

  const downloadScope: ModelDownloadScope = role === "sort" ? "sortOnly" : "visionOnly";
  const title =
    role === "sort"
      ? t("settings.models.downloadModalSortTitle")
      : t("settings.models.downloadModalVisionTitle");

  return (
    <ModalShell title={title} onClose={onClose} maxWidthClass="max-w-lg">
      <div className="px-5 pb-5 pt-2 sm:px-6">
        <ModelDownloadBlocks
          settings={settings}
          modelHook={modelHook}
          onSettingsPatch={onSettingsPatch}
          downloadScope={downloadScope}
          showRefreshButtons
          entitlement={entitlement}
        />
      </div>
    </ModalShell>
  );
}
