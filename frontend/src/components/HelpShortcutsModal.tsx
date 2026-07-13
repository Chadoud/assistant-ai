import { useState, type CSSProperties, type ReactNode } from "react";
import { toast } from "sonner";
import { modShortcutLabel } from "../utils/platform";
import { APP_VERSION } from "../appVersion";
import { APP_DISPLAY_NAME } from "../constants";
import { useI18n } from "../i18n/I18nContext";

interface HelpDiagnosticsPayload {
  backendOnline: boolean;
  lastHealthOkAt: number | null;
  modelCount: number;
  ocrStatus: string;
}

interface HelpShortcutsModalProps {
  open: boolean;
  onClose: () => void;
  onReplayTour: () => void;
  diagnostics?: HelpDiagnosticsPayload;
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      className="px-1.5 py-0.5 rounded-md border border-border bg-bg-secondary text-2xs font-mono font-semibold text-text-primary whitespace-nowrap"
    >
      {children}
    </kbd>
  );
}

/** Matches `MOD_TAB_ORDER` / command palette shortcuts (⌘/Ctrl + 1…7). */
const HELP_TAB_SHORTCUT_ROWS: readonly { shortcutDigit: string; labelKey: string }[] = [
  { shortcutDigit: "1", labelKey: "commands.goAiManager" },
  { shortcutDigit: "2", labelKey: "commands.goAssistant" },
  { shortcutDigit: "3", labelKey: "commands.goSort" },
  { shortcutDigit: "4", labelKey: "commands.goResults" },
  { shortcutDigit: "5", labelKey: "commands.goHistory" },
  { shortcutDigit: "6", labelKey: "commands.goSources" },
  { shortcutDigit: "7", labelKey: "commands.goSettings" },
];

function formatDiagnosticsText(d: HelpDiagnosticsPayload): string {
  const lines = [
    `${APP_DISPLAY_NAME} ${APP_VERSION}`,
    `Backend API: ${d.backendOnline ? "reachable" : "offline"}`,
    `Installed Ollama models (count): ${d.modelCount}`,
    `OCR: ${d.ocrStatus}`,
    `Last health OK: ${d.lastHealthOkAt ? new Date(d.lastHealthOkAt).toISOString() : "never"}`,
    `User agent: ${typeof navigator !== "undefined" ? navigator.userAgent : "n/a"}`,
  ];
  return lines.join("\n");
}

export default function HelpShortcutsModal({
  open,
  onClose,
  onReplayTour,
  diagnostics,
}: HelpShortcutsModalProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  if (!open) return null;

  const mod = modShortcutLabel();

  const copyDiagnostics = async () => {
    if (!diagnostics) return;
    let text = formatDiagnosticsText(diagnostics);
    try {
      const specs = await window.electronAPI?.getSystemSpecs?.();
      if (specs?.platform) {
        text += `\nPlatform: ${specs.platform}${specs.arch ? ` (${specs.arch})` : ""}`;
      }
    } catch {
      /* optional */
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(t("help.diagnosticsCopyToast"));
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("help.diagnosticsCopyFailed"));
    }
  };

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-shortcuts-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-overlay-scrim backdrop-blur-[2px]"
        aria-label={t("help.close")}
        onClick={onClose}
      />
      <div
        className="relative flex w-full max-w-lg max-h-[min(90vh,640px)] flex-col overflow-hidden rounded-2xl border border-border bg-bg-card shadow-accent-glow"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-3xs font-bold uppercase tracking-widest text-muted mb-1">{t("help.eyebrow")}</p>
            <h2 id="help-shortcuts-title" className="text-lg font-semibold text-text-primary">
              {t("help.title")}
            </h2>
            <p className="text-sm text-muted mt-1 leading-relaxed">{t("help.intro")}</p>
            <p className="text-sm text-muted mt-2 leading-relaxed">{t("help.capabilitiesBlurb")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-2 rounded-lg text-muted hover:text-text-primary hover:bg-hover-overlay transition-colors"
            aria-label={t("help.close")}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <section className="mb-5">
          <h3 className="text-2xs font-bold uppercase tracking-widest text-muted mb-2">{t("help.sectionGoToTab")}</h3>
          <ul className="space-y-2 text-sm">
            {HELP_TAB_SHORTCUT_ROWS.map(({ shortcutDigit, labelKey }) => (
              <li
                key={labelKey}
                className="flex items-center justify-between gap-3 py-1.5 border-b border-border-soft"
              >
                <span className="text-text-primary">{t(labelKey)}</span>
                <span className="flex items-center gap-1 shrink-0">
                  <Kbd>{mod}</Kbd>
                  <span className="text-muted text-2xs">+</span>
                  <Kbd>{shortcutDigit}</Kbd>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-5">
          <h3 className="text-2xs font-bold uppercase tracking-widest text-muted mb-2">{t("help.sectionThisWindow")}</h3>
          <ul className="space-y-2 text-sm text-muted">
            <li className="flex items-center justify-between gap-3 py-1.5 border-b border-border-soft">
              <span>{t("help.rowOpenHelp")}</span>
              <span className="flex items-center gap-1 shrink-0">
                <Kbd>{mod}</Kbd>
                <span className="text-muted text-2xs">+</span>
                <Kbd>Shift</Kbd>
                <span className="text-muted text-2xs">+</span>
                <Kbd>/</Kbd>
              </span>
            </li>
            <li className="flex items-center justify-between gap-3 py-1.5 border-b border-border-soft">
              <span>{t("help.rowOrF1")}</span>
              <Kbd>F1</Kbd>
            </li>
            <li className="flex items-center justify-between gap-3 py-1.5 border-b border-border-soft">
              <span>{t("help.rowCommandPalette")}</span>
              <span className="flex items-center gap-1 shrink-0">
                <Kbd>{mod}</Kbd>
                <span className="text-muted text-2xs">+</span>
                <Kbd>K</Kbd>
              </span>
            </li>
            <li className="flex items-center justify-between gap-3 py-1.5">
              <span>{t("help.rowCloseDialogs")}</span>
              <Kbd>Esc</Kbd>
            </li>
          </ul>
        </section>

        {diagnostics && (
          <section className="rounded-xl border border-border bg-bg-secondary p-4 mb-5">
            <p className="text-sm text-text-primary mb-3 leading-relaxed">{t("help.supportRetryHint")}</p>
            <h3 className="text-2xs font-bold uppercase tracking-widest text-muted mb-2">
              {t("help.supportDiagnosticsTitle")}
            </h3>
            <p className="text-sm text-muted mb-3 leading-relaxed">{t("help.supportDiagnosticsBody")}</p>
            <button
              type="button"
              onClick={() => void copyDiagnostics()}
              className="w-full px-3 py-2 rounded-lg text-sm font-medium border border-border text-text-primary hover:bg-hover-overlay transition-colors"
            >
              {copied ? t("help.diagnosticsCopied") : t("help.copyDiagnostics")}
            </button>
          </section>
        )}

        <section className="rounded-xl border border-border bg-bg-secondary p-4 mb-5">
          <h3 className="text-2xs font-bold uppercase tracking-widest text-muted mb-2">{t("help.sectionQuickTips")}</h3>
          <ul className="text-sm text-muted space-y-2 list-disc pl-4 marker:text-accent">
            <li>
              <span className="text-text-primary font-medium">{t("help.tipOfflineLabel")}</span> {t("help.tipOfflineBody")}
            </li>
            <li>
              <span className="text-text-primary font-medium">{t("help.tipSettingsLabel")}</span> {t("help.tipSettingsBody")}
            </li>
            <li>
              <span className="text-text-primary font-medium">{t("help.tipScansLabel")}</span> {t("help.tipScansBody")}
            </li>
            <li>{t("help.tipResultsBody")}</li>
          </ul>
        </section>

        <p className="text-center text-xs text-muted border-t border-border-soft pt-4 mb-4">
          {t("help.paletteHintPrefix")}{" "}
          <Kbd>{mod}</Kbd>
          <span className="text-muted"> + </span>
          <Kbd>K</Kbd> {t("help.paletteHintSuffix")}
        </p>

        <div className="flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={() => {
              onClose();
              onReplayTour();
            }}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-text-primary hover:bg-hover-overlay transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {t("help.replayTour")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-button-primary text-white hover:bg-button-hover transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {t("help.done")}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
