import { useEffect, useState, type CSSProperties } from "react";
import { useI18n } from "../i18n/I18nContext";
import type { UpdateEvent, UpdateState } from "../types/electron";
import { formatReleaseNotesPlain } from "../utils/formatReleaseNotesPlain";

type Phase = "available" | "downloading" | "downloaded" | "installing" | "error";

interface UpdateInfo {
  version: string | null;
  notes: string | null;
  canSelfUpdate: boolean;
  downloadUrl: string | null;
}

/**
 * In-app update prompt. Self-contained: subscribes to main-process update events and
 * renders nothing until an update is available. On macOS it downloads and installs in
 * place (with real byte progress); on Windows it opens the download page.
 */
export default function UpdateModal() {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [phase, setPhase] = useState<Phase>("available");
  const [progress, setProgress] = useState(0);
  const [info, setInfo] = useState<UpdateInfo>({
    version: null,
    notes: null,
    canSelfUpdate: false,
    downloadUrl: null,
  });

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onUpdateEvent) return;

    const applyAvailable = (next: UpdateInfo) => {
      setInfo(next);
      setPhase("available");
      setVisible(true);
    };

    void api.updateGetState?.().then((s: UpdateState) => {
      if (s?.status === "available") {
        applyAvailable({
          version: s.version,
          notes: s.notes,
          canSelfUpdate: s.canSelfUpdate,
          downloadUrl: s.downloadUrl,
        });
      } else if (s?.status === "downloading" || s?.status === "downloaded" || s?.status === "installing") {
        setVisible(true);
        setPhase(s.status === "installing" ? "installing" : s.status === "downloaded" ? "downloaded" : "downloading");
        setProgress(typeof s.progress === "number" ? s.progress : s.status === "installing" ? 100 : 0);
        setInfo((prev) => ({
          ...prev,
          version: s.version,
          notes: s.notes,
          canSelfUpdate: s.canSelfUpdate,
          downloadUrl: s.downloadUrl,
        }));
      }
    });

    const unsubscribe = api.onUpdateEvent((event: UpdateEvent) => {
      switch (event.type) {
        case "available":
          applyAvailable({
            version: event.version,
            notes: event.notes,
            canSelfUpdate: event.canSelfUpdate,
            downloadUrl: event.downloadUrl,
          });
          break;
        case "progress":
          setPhase("downloading");
          setProgress(event.percent);
          break;
        case "downloaded":
          setPhase("downloaded");
          setProgress(100);
          setVisible(true);
          break;
        case "installing":
          setPhase("installing");
          setProgress(100);
          setVisible(true);
          break;
        case "error":
          setPhase("error");
          break;
      }
    });

    return unsubscribe;
  }, []);

  if (!visible || (dismissed && phase !== "downloading" && phase !== "installing")) return null;

  const close = () => {
    if (phase === "downloading" || phase === "installing") return;
    setDismissed(true);
  };

  const onPrimary = async () => {
    const result = await window.electronAPI?.updateStart?.();
    // Windows / fallback: the OS browser opened the download page — nothing more to do here.
    if (result?.mode === "redirect") {
      close();
    }
  };

  const onInstall = () => {
    void window.electronAPI?.updateInstall?.();
  };

  const isBusy = phase === "downloading" || phase === "installing" || phase === "downloaded";

  const versionText = info.version ? t("update.versionLabel", { version: info.version }) : "";
  const releaseNotes =
    info.notes && phase === "available" ? formatReleaseNotesPlain(info.notes) : "";

  return (
    <div
      className="fixed inset-0 z-[420] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-overlay-scrim backdrop-blur-[2px]"
        aria-label={t("update.close")}
        onClick={close}
        disabled={isBusy}
      />
      <div
        className="relative flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-bg-card shadow-accent-glow"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <div>
            <p className="text-3xs font-bold uppercase tracking-widest text-muted mb-1">
              {phase === "error" ? t("update.errorTitle") : t("update.title")}
            </p>
            <h2 id="update-modal-title" className="text-lg font-semibold text-text-primary">
              {phase === "error" ? t("update.errorBody") : t("update.subtitle")}
            </h2>
            {versionText && phase !== "error" ? (
              <p className="text-sm text-muted mt-1">{versionText}</p>
            ) : null}
          </div>

          {releaseNotes ? (
            <section className="rounded-xl border border-border bg-bg-secondary p-3 max-h-40 overflow-y-auto">
              <h3 className="text-2xs font-bold uppercase tracking-widest text-muted mb-1">
                {t("update.notesTitle")}
              </h3>
              <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
                {releaseNotes}
              </p>
            </section>
          ) : null}

          {phase === "downloading" ? (
            <div>
              <div className="flex items-center justify-between text-sm text-muted mb-1">
                <span>{t("update.downloading")}</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-bg-secondary">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : null}

          {phase === "installing" || phase === "downloaded" ? (
            <p className="text-sm text-muted">{t("update.restarting")}</p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            {phase === "downloaded" && !info.canSelfUpdate ? (
              <button
                type="button"
                onClick={onInstall}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-button-primary text-white hover:bg-button-hover transition-colors"
              >
                {t("update.restartToUpdate")}
              </button>
            ) : null}

            {phase === "available" ? (
              <>
                <button
                  type="button"
                  onClick={close}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-text-primary hover:bg-hover-overlay transition-colors"
                >
                  {t("update.later")}
                </button>
                <button
                  type="button"
                  onClick={() => void onPrimary()}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-button-primary text-white hover:bg-button-hover transition-colors"
                >
                  {info.canSelfUpdate ? t("update.updateNow") : t("update.downloadPage")}
                </button>
              </>
            ) : null}

            {phase === "error" ? (
              <>
                <button
                  type="button"
                  onClick={close}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-text-primary hover:bg-hover-overlay transition-colors"
                >
                  {t("update.close")}
                </button>
                <button
                  type="button"
                  onClick={() => void onPrimary()}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-button-primary text-white hover:bg-button-hover transition-colors"
                >
                  {t("update.downloadPage")}
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
