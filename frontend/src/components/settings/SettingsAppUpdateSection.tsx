import { useCallback, useEffect, useState } from "react";
import { APP_VERSION } from "../../appVersion";
import { useI18n } from "../../i18n/I18nContext";
import type { UpdateEvent, UpdateState } from "../../types/electron";
import { CARD_SHELL_CLASS } from "../../utils/styles";

function hasUpdateApi(): boolean {
  return typeof window.electronAPI?.updateCheck === "function";
}

function applyUpdateState(
  state: UpdateState,
  setStatus: (s: UpdateState["status"]) => void,
  setRemoteVersion: (v: string | null) => void,
  setProgress: (p: number) => void,
) {
  setStatus(state.status);
  setRemoteVersion(state.version);
  if (typeof state.progress === "number") setProgress(state.progress);
}

/**
 * Manual update check in Settings → About & help. Complements the automatic
 * UpdateModal on startup; uses the same main-process feed on exosites.ch.
 */
export default function SettingsAppUpdateSection() {
  const { t } = useI18n();
  const [status, setStatus] = useState<UpdateState["status"]>("idle");
  const [remoteVersion, setRemoteVersion] = useState<string | null>(null);
  const [canSelfUpdate, setCanSelfUpdate] = useState(false);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);

  const syncFromMain = useCallback(async () => {
    const state = await window.electronAPI?.updateGetState?.();
    if (!state) return;
    applyUpdateState(state, setStatus, setRemoteVersion, setProgress);
    setCanSelfUpdate(state.canSelfUpdate);
  }, []);

  useEffect(() => {
    if (!hasUpdateApi()) return;
    void syncFromMain();

    const unsubscribe = window.electronAPI?.onUpdateEvent?.((event: UpdateEvent) => {
      switch (event.type) {
        case "available":
          setStatus("available");
          setRemoteVersion(event.version);
          setCanSelfUpdate(event.canSelfUpdate);
          break;
        case "progress":
          setStatus("downloading");
          setProgress(event.percent);
          break;
        case "downloaded":
          setStatus("downloaded");
          setProgress(100);
          setRemoteVersion(event.version);
          break;
        case "installing":
          setStatus("installing");
          setProgress(100);
          setRemoteVersion(event.version);
          break;
        case "error":
          setStatus("error");
          break;
      }
    });
    return unsubscribe;
  }, [syncFromMain]);

  if (!hasUpdateApi()) return null;

  const onCheck = async () => {
    setBusy(true);
    setStatus("checking");
    try {
      await window.electronAPI?.updateCheck?.();
      await syncFromMain();
    } finally {
      setBusy(false);
    }
  };

  const onUpdate = async () => {
    setBusy(true);
    try {
      await window.electronAPI?.updateStart?.();
    } finally {
      setBusy(false);
    }
  };

  const onInstall = () => {
    void window.electronAPI?.updateInstall?.();
  };

  const statusDetail = (() => {
    switch (status) {
      case "checking":
        return t("settings.appUpdates.checking");
      case "up-to-date":
        return t("settings.appUpdates.upToDate");
      case "available":
        return remoteVersion
          ? t("settings.appUpdates.available", { version: remoteVersion })
          : t("settings.appUpdates.availableGeneric");
      case "downloading":
        return t("settings.appUpdates.downloading", { percent: progress });
      case "downloaded":
        return t("settings.appUpdates.downloaded");
      case "installing":
        return t("settings.appUpdates.restarting");
      case "error":
        return t("settings.appUpdates.error");
      default:
        return t("settings.appUpdates.idle");
    }
  })();

  return (
    <div id="settings-app-updates" className={`${CARD_SHELL_CLASS} scroll-mt-24 p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">{t("settings.appUpdates.title")}</p>
          <p className="text-xs text-muted mt-0.5">
            {t("settings.appUpdates.currentVersion", { version: APP_VERSION })}
          </p>
          <p className="text-xs text-muted leading-snug mt-2">{statusDetail}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {status === "downloaded" && !canSelfUpdate ? (
            <button
              type="button"
              onClick={onInstall}
              className="rounded-lg bg-button-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-button-hover"
            >
              {t("settings.appUpdates.restart")}
            </button>
          ) : null}
          {status === "available" || status === "error" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onUpdate()}
              className="rounded-lg bg-button-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-button-hover disabled:opacity-40"
            >
              {canSelfUpdate ? t("settings.appUpdates.updateNow") : t("settings.appUpdates.downloadPage")}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy || status === "downloading" || status === "installing"}
            onClick={() => void onCheck()}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-hover-overlay disabled:opacity-40"
          >
            {busy || status === "checking" ? t("settings.appUpdates.checking") : t("settings.appUpdates.check")}
          </button>
        </div>
      </div>
      {status === "downloading" ? (
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-bg-secondary">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
