import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { hasElectronBridge } from "../../utils/platform";
import { useI18n } from "../../i18n/I18nContext";
import {
  INFOMANIAK_CALENDAR_INTEGRATION_CHANGED_EVENT,
  INFOMANIAK_DRIVE_INTEGRATION_CHANGED_EVENT,
  notifyInfomaniakAllIntegrationsChanged,
} from "./infomaniakIntegrationEvents";
import InfomaniakTokenSetupModal from "./InfomaniakTokenSetupModal";

const PROVIDER_INFOMANIAK_ALL = "infomaniak-all";
const PROVIDER_INFOMANIAK = "infomaniak";
const PROVIDER_INFOMANIAK_CALENDAR = "infomaniak-calendar";

/**
 * Desktop-only: one Infomaniak OAuth when Manager app (or combined scope env) grants kDrive + Calendar.
 */
export default function InfomaniakConnectAllButton() {
  const { t } = useI18n();
  const desktop = hasElectronBridge();
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [oauthConfigured, setOauthConfigured] = useState(false);
  const [driveConnected, setDriveConnected] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [showTokenGuide, setShowTokenGuide] = useState(false);

  const refreshStatus = useCallback(async () => {
    if (!desktop || !window.electronAPI) {
      setLoadingStatus(false);
      setOauthConfigured(false);
      return;
    }
    setLoadingStatus(true);
    try {
      const prov = await window.electronAPI.integrationListProviders();
      const p = prov.providers?.find((x) => x.id === PROVIDER_INFOMANIAK);
      setOauthConfigured(!!p?.oauthConfigured);
      const acc = await window.electronAPI.integrationGetAccounts();
      const row = (pid: string) => acc.accounts?.find((a) => a.providerId === pid);
      setDriveConnected(!!row(PROVIDER_INFOMANIAK)?.connected);
      setCalendarConnected(!!row(PROVIDER_INFOMANIAK_CALENDAR)?.connected);
    } catch {
      setOauthConfigured(false);
    } finally {
      setLoadingStatus(false);
    }
  }, [desktop]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!desktop) return;
    const onChange = () => void refreshStatus();
    window.addEventListener(INFOMANIAK_DRIVE_INTEGRATION_CHANGED_EVENT, onChange);
    window.addEventListener(INFOMANIAK_CALENDAR_INTEGRATION_CHANGED_EVENT, onChange);
    return () => {
      window.removeEventListener(INFOMANIAK_DRIVE_INTEGRATION_CHANGED_EVENT, onChange);
      window.removeEventListener(INFOMANIAK_CALENDAR_INTEGRATION_CHANGED_EVENT, onChange);
    };
  }, [desktop, refreshStatus]);

  const connectAll = useCallback(async () => {
    if (!desktop || !window.electronAPI) return;
    setOauthBusy(true);
    try {
      const r = await window.electronAPI.integrationConnect({ providerId: PROVIDER_INFOMANIAK_ALL });
      if (r.ok) {
        toast.message(t("sources.infomaniakConnectAllSuccess"));
        notifyInfomaniakAllIntegrationsChanged();
      } else {
        toast.error(t("sources.infomaniakConnectAllFailed"), {
          description: r.reason || undefined,
        });
      }
    } catch (e) {
      toast.error(t("sources.infomaniakConnectAllFailed"), {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setOauthBusy(false);
      await refreshStatus();
    }
  }, [desktop, refreshStatus, t]);

  if (!desktop) return null;

  const allConnected = driveConnected && calendarConnected;
  const disabled = loadingStatus || (!oauthConfigured && !driveConnected) || allConnected || oauthBusy;

  const title =
    allConnected && !loadingStatus
      ? t("sources.infomaniakConnectAllDisabledFullyConnected")
      : t("sources.infomaniakConnectAllTitle");

  return (
    <>
      {/* Keep help to the visual left of Connect all even under document RTL */}
      <div className="flex flex-row items-center gap-1.5" dir="ltr">
        <button
          type="button"
          title={t("sources.connectorSetupHelp")}
          aria-label={t("sources.connectorSetupHelp")}
          onClick={() => setShowTokenGuide(true)}
          className="flex items-center justify-center size-7 rounded-full border border-border text-muted hover:bg-hover-overlay hover:text-text-primary transition-colors text-xs font-bold shrink-0"
        >
          ?
        </button>

        <button
          type="button"
          disabled={disabled}
          title={title}
          onClick={() => void connectAll()}
          className="text-sm font-medium px-3 py-1.5 rounded-lg border border-accent-line bg-accent-light text-accent hover:bg-accent/15 disabled:opacity-40 shrink-0"
        >
          {oauthBusy ? t("sources.infomaniakConnectAllWorking") : t("sources.infomaniakConnectAll")}
        </button>
      </div>

      {showTokenGuide && (
        <InfomaniakTokenSetupModal
          scopePreset="all"
          onClose={() => setShowTokenGuide(false)}
          onTokenSaved={() => {
            notifyInfomaniakAllIntegrationsChanged();
            void refreshStatus();
          }}
        />
      )}
    </>
  );
}
