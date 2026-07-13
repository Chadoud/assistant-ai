import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { publicAssetUrl } from "../../constants";
import { useI18n } from "../../i18n/I18nContext";
import { hasElectronBridge } from "../../utils/platform";
import { copyTextToClipboard } from "../../utils/clipboard";

/**
 * Fixed loopback redirect URI Notion requires. Must match exactly the value
 * registered in `electron/integrations/notion.js` — Notion does not honor
 * RFC 8252 port-agnostic loopback matching, so the port is hardcoded.
 *
 * Uses `localhost` (not `127.0.0.1`): Notion's Connections portal rejects a raw
 * loopback IP and auto-prepends `https://`, but accepts `http://localhost` as a
 * valid development redirect.
 */
const NOTION_REDIRECT_URI = "http://localhost:8731/callback";

const NOTION_INTEGRATIONS_URL = "https://www.notion.so/my-integrations";

interface Step {
  titleKey: `sources.${string}`;
  bodyKey: `sources.${string}`;
  screenshot?: string;
  screenshotAltKey?: `sources.${string}`;
}

const STEPS: Step[] = [
  {
    titleKey: "sources.notionOAuthStep0Title",
    bodyKey: "sources.notionOAuthStep0Body",
    screenshot: publicAssetUrl("onboarding/notion-oauth-step1.png"),
    screenshotAltKey: "sources.notionOAuthStep0Alt",
  },
  {
    titleKey: "sources.notionOAuthStep1Title",
    bodyKey: "sources.notionOAuthStep1Body",
    screenshot: publicAssetUrl("onboarding/notion-oauth-step2.png"),
    screenshotAltKey: "sources.notionOAuthStep1Alt",
  },
  {
    titleKey: "sources.notionOAuthStep2Title",
    bodyKey: "sources.notionOAuthStep2Body",
    screenshot: publicAssetUrl("onboarding/notion-oauth-step3.png"),
    screenshotAltKey: "sources.notionOAuthStep2Alt",
  },
  {
    titleKey: "sources.notionOAuthStep3Title",
    bodyKey: "sources.notionOAuthStep3Body",
    screenshot: publicAssetUrl("onboarding/notion-oauth-step4.png"),
    screenshotAltKey: "sources.notionOAuthStep3Alt",
  },
  {
    titleKey: "sources.notionOAuthStep4Title",
    bodyKey: "sources.notionOAuthStep4Body",
    screenshot: publicAssetUrl("onboarding/notion-oauth-step5.png"),
    screenshotAltKey: "sources.notionOAuthStep4Alt",
  },
  {
    titleKey: "sources.notionOAuthStep5Title",
    bodyKey: "sources.notionOAuthStep5Body",
  },
];

/** Image that quietly removes itself if the asset is missing (screenshots dropped in later). */
function StepScreenshot({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <div className="rounded-xl overflow-hidden border border-border/70 shadow-sm shadow-black/10">
      <img
        src={src}
        alt={alt}
        className="w-full object-cover"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

interface NotionOAuthSetupModalProps {
  onClose: () => void;
  /** Called after credentials are saved and the connect flow completes (status should refresh). */
  onConfigured: () => void;
}

export default function NotionOAuthSetupModal({ onClose, onConfigured }: NotionOAuthSetupModalProps) {
  const { t } = useI18n();
  const desktop = hasElectronBridge();
  const [step, setStep] = useState(0);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);
  const clientIdInputRef = useRef<HTMLInputElement>(null);
  const redirectUriInputRef = useRef<HTMLInputElement>(null);
  const isLastStep = step === STEPS.length - 1;
  const isFirstStep = step === 0;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    return () => prev?.focus();
  }, []);

  useEffect(() => {
    if (isLastStep) {
      setTimeout(() => clientIdInputRef.current?.focus(), 50);
    }
  }, [isLastStep]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const openIntegrationsPage = useCallback(() => {
    if (desktop && window.electronAPI) {
      void window.electronAPI.openExternal(NOTION_INTEGRATIONS_URL);
    } else {
      window.open(NOTION_INTEGRATIONS_URL, "_blank", "noopener,noreferrer");
    }
  }, [desktop]);

  const copyRedirectUri = useCallback(async () => {
    const ok = await copyTextToClipboard(NOTION_REDIRECT_URI);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      return;
    }
    setCopied(false);
    // Last resort: select the field so the user can copy it manually.
    redirectUriInputRef.current?.select();
  }, []);

  const handleSaveAndConnect = useCallback(async () => {
    const id = clientId.trim();
    const secret = clientSecret.trim();
    if (!id || !secret) {
      setFormError(t("sources.notionOAuthErrorMissing"));
      return;
    }
    if (!desktop || !window.electronAPI) {
      toast.error(t("sources.notionOAuthErrorDesktopOnly"));
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const saved = await window.electronAPI.integrationSaveNotionOAuthClient({
        clientId: id,
        clientSecret: secret,
      });
      if (!saved.ok) {
        setFormError(saved.reason ?? t("sources.notionOAuthErrorSaveFailed"));
        return;
      }
      const connected = await window.electronAPI.integrationConnect({ providerId: "notion" });
      if (!connected.ok) {
        toast.error(t("sources.notionConnectFailed"), { description: connected.reason ?? "" });
        // Credentials are saved; user can retry Connect from the card.
        onConfigured();
        onClose();
        return;
      }
      toast.success(t("sources.notionConnectSuccess"));
      onConfigured();
      onClose();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t("sources.notionOAuthErrorSaveFailed"));
    } finally {
      setSaving(false);
    }
  }, [clientId, clientSecret, desktop, t, onConfigured, onClose]);

  const currentStep = STEPS[step];

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="notion-oauth-modal-title"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl border border-border bg-bg-card shadow-2xl shadow-black/30 flex flex-col overflow-hidden"
        style={{ maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <img src={publicAssetUrl("brands/notion.png")} alt="Notion" className="h-6 w-6 shrink-0 object-contain" />
            <h2
              id="notion-oauth-modal-title"
              className="text-base font-semibold text-text-primary leading-snug truncate"
            >
              {t("sources.notionOAuthModalTitle")}
            </h2>
          </div>
          <button
            type="button"
            aria-label={t("sources.notionOAuthModalClose")}
            onClick={onClose}
            className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-muted hover:bg-hover-overlay hover:text-text-primary transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1.5 px-6 pt-4 pb-2 shrink-0">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-200 ${
                i <= step ? "bg-accent" : "bg-border"
              }`}
            />
          ))}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          <p className="text-xs font-medium text-accent uppercase tracking-wider">
            {t("sources.notionOAuthStepLabel", {
              current: String(step + 1),
              total: String(STEPS.length),
            })}
          </p>

          <h3 className="text-lg font-semibold text-text-primary leading-snug">
            {t(currentStep.titleKey)}
          </h3>

          <p className="text-sm text-muted leading-relaxed">{t(currentStep.bodyKey)}</p>

          {/* Open Notion integrations dashboard — first step */}
          {isFirstStep && (
            <button
              type="button"
              onClick={openIntegrationsPage}
              className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:underline"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M6 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1v-3M10 2h4m0 0v4m0-4L7 9"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {t("sources.notionOAuthOpenDashboardLink")}
            </button>
          )}

          {/* Redirect URI — copyable read-only field (step index 2) */}
          {step === 2 && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-text-primary uppercase tracking-wider">
                {t("sources.notionOAuthRedirectLabel")}
              </label>
              <div className="flex items-stretch gap-2" dir="ltr">
                <input
                  ref={redirectUriInputRef}
                  type="text"
                  readOnly
                  value={NOTION_REDIRECT_URI}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 rounded-lg border border-border bg-bg-secondary px-3.5 py-2.5 text-sm font-mono text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
                <button
                  type="button"
                  onClick={() => void copyRedirectUri()}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-accent-line bg-accent-light px-3 py-2 text-sm font-medium text-accent hover:bg-accent/15 transition-colors"
                >
                  {copied ? t("sources.notionOAuthCopied") : t("sources.notionOAuthCopy")}
                </button>
              </div>
              <p className="text-xs text-muted leading-relaxed">{t("sources.notionOAuthRedirectHint")}</p>
            </div>
          )}

          {/* Screenshot */}
          {currentStep.screenshot && (
            <StepScreenshot
              src={currentStep.screenshot}
              alt={currentStep.screenshotAltKey ? t(currentStep.screenshotAltKey) : ""}
            />
          )}

          {/* Credentials input — last step */}
          {isLastStep && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="notion-client-id" className="block text-sm font-medium text-text-primary">
                  {t("sources.notionOAuthClientIdLabel")}
                </label>
                <input
                  ref={clientIdInputRef}
                  id="notion-client-id"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={clientId}
                  onChange={(e) => {
                    setClientId(e.target.value);
                    setFormError(null);
                  }}
                  placeholder={t("sources.notionOAuthClientIdPlaceholder")}
                  className={`w-full rounded-lg border px-3.5 py-2.5 text-sm font-mono bg-bg-secondary text-text-primary placeholder:text-muted/50 focus:outline-none focus:ring-2 transition-colors ${
                    formError
                      ? "border-error-line focus:ring-error/20"
                      : "border-border focus:border-accent focus:ring-accent/20"
                  }`}
                  dir="ltr"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="notion-client-secret" className="block text-sm font-medium text-text-primary">
                  {t("sources.notionOAuthClientSecretLabel")}
                </label>
                <input
                  id="notion-client-secret"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={clientSecret}
                  onChange={(e) => {
                    setClientSecret(e.target.value);
                    setFormError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !saving) void handleSaveAndConnect();
                  }}
                  placeholder={t("sources.notionOAuthClientSecretPlaceholder")}
                  className={`w-full rounded-lg border px-3.5 py-2.5 text-sm font-mono bg-bg-secondary text-text-primary placeholder:text-muted/50 focus:outline-none focus:ring-2 transition-colors ${
                    formError
                      ? "border-error-line focus:ring-error/20"
                      : "border-border focus:border-accent focus:ring-accent/20"
                  }`}
                  dir="ltr"
                />
                {formError && <p className="text-xs text-error leading-snug">{formError}</p>}
                <p className="text-xs text-muted leading-relaxed">{t("sources.notionOAuthClientSecretHint")}</p>
              </div>

              {/* Share-pages info card */}
              <div className="rounded-xl border border-warning-line/60 bg-warning-soft/30 p-4 space-y-2">
                <div className="flex items-start gap-2.5">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    className="shrink-0 mt-0.5 text-warning"
                    aria-hidden="true"
                  >
                    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M8 5v3.5M8 11h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <div className="space-y-1 min-w-0">
                    <p className="text-sm font-semibold text-text-primary leading-snug">
                      {t("sources.notionOAuthShareTitle")}
                    </p>
                    <p className="text-xs text-muted leading-relaxed">{t("sources.notionOAuthShareBody")}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4 shrink-0">
          <button
            type="button"
            onClick={() => (isFirstStep ? onClose() : setStep((s) => s - 1))}
            className="text-sm px-4 py-2 rounded-lg border border-border text-muted hover:bg-hover-overlay transition-colors"
          >
            {isFirstStep ? t("sources.notionOAuthCancel") : t("sources.notionOAuthBack")}
          </button>

          {isLastStep ? (
            <button
              type="button"
              disabled={saving || !clientId.trim() || !clientSecret.trim()}
              onClick={() => void handleSaveAndConnect()}
              className="text-sm font-semibold px-5 py-2 rounded-lg bg-button-primary text-white hover:bg-button-hover disabled:opacity-40 transition-colors"
            >
              {saving ? t("sources.notionOAuthSaving") : t("sources.notionOAuthSaveConnect")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className="text-sm font-semibold px-5 py-2 rounded-lg bg-button-primary text-white hover:bg-button-hover transition-colors"
            >
              {t("sources.notionOAuthNext")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
