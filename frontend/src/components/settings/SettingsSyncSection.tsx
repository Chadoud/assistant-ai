/**
 * Settings → Sync — E2E encrypted multi-device sync (GO SYNC).
 */

import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import ProUpgradeCard from "../ProUpgradeCard";

interface SyncStatus {
  enabled?: boolean;
  lastRunAt?: string | null;
  lastError?: string | null;
  pendingCount?: number;
  conflictCount?: number;
}

interface Props {
  canUseSync: boolean;
  onUpgrade: () => void;
}

export default function SettingsSyncSection({ canUseSync, onUpgrade }: Props) {
  const { t } = useI18n();
  const [status, setStatus] = useState<SyncStatus>({});
  const [busy, setBusy] = useState(false);
  const [pairQrDataUrl, setPairQrDataUrl] = useState<string | null>(null);
  const [pairError, setPairError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.syncGetStatus) return;
    const s = await api.syncGetStatus();
    setStatus(s ?? {});
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!status.enabled) {
      setPairQrDataUrl(null);
      setPairError(null);
      return;
    }
    const api = window.electronAPI;
    if (!api?.syncGetPairingPayload) return;
    const getPairingPayload = api.syncGetPairingPayload;
    void (async () => {
      try {
        const payload = await getPairingPayload();
        const json = JSON.stringify(payload);
        const url = await QRCode.toDataURL(json, { margin: 1, width: 220 });
        setPairQrDataUrl(url);
        setPairError(null);
      } catch {
        setPairQrDataUrl(null);
        setPairError("Could not generate pairing QR. Check cloud URL and sync settings.");
      }
    })();
  }, [status.enabled]);

  const toggle = async () => {
    if (!canUseSync) return;
    const api = window.electronAPI;
    if (!api?.syncSetEnabled) return;
    setBusy(true);
    try {
      await api.syncSetEnabled(!status.enabled);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const runNow = async () => {
    const api = window.electronAPI;
    if (!api?.syncRunNow) return;
    setBusy(true);
    try {
      await api.syncRunNow();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!canUseSync) {
    return (
      <section className="space-y-3" data-tour="settings-sync">
        <h3 className="text-sm font-semibold text-text-primary">{t("sync.settingsTitle")}</h3>
        <ProUpgradeCard
          description={`${t("sync.proTitle")} — ${t("sync.proBody")}`}
          onUpgrade={onUpgrade}
        />
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-bg-card p-4" data-tour="settings-sync">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{t("sync.settingsTitle")}</h3>
          <p className="mt-0.5 text-xs text-muted">{t("sync.settingsDesc")}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(status.enabled)}
          disabled={busy}
          onClick={() => void toggle()}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
            status.enabled ? "bg-accent" : "bg-border"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              status.enabled ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </div>
      {status.enabled ? (
        <div className="space-y-3 text-xs text-text-secondary">
          <p>{status.lastRunAt ? t("sync.lastRun").replace("{time}", new Date(status.lastRunAt).toLocaleString()) : t("sync.neverRun")}</p>
          {status.lastError ? <p className="text-red-500">{t("sync.errorPrefix")} {status.lastError}</p> : null}
          <button type="button" disabled={busy} onClick={() => void runNow()} className="text-accent hover:underline">
            {t("sync.runNow")}
          </button>
          <div className="rounded-lg border border-border bg-bg-primary/40 p-3">
            <p className="text-xs font-medium text-text-primary">Pair mobile device</p>
            <p className="mt-1 text-[11px] text-muted">
              On your phone: Settings → Pair with desktop, then scan this QR code.
            </p>
            {pairError ? <p className="mt-2 text-[11px] text-red-500">{pairError}</p> : null}
            {pairQrDataUrl ? (
              <img src={pairQrDataUrl} alt="Mobile pairing QR code" className="mt-3 h-[220px] w-[220px] rounded-md bg-white p-2" />
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
