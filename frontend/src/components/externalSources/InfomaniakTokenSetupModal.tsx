import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { publicAssetUrl } from "../../constants";
import { useI18n } from "../../i18n/I18nContext";
import { hasElectronBridge } from "../../utils/platform";

/** Which surface opened the wizard; drives which scopes appear on the scopes step. */
type IkTokenScopePreset = "all" | "kdrive" | "mail" | "calendar";

/** Scope slugs Infomaniak shows in the Manager (labels come from locales). */
const REQUIRED_SCOPE_IDS = [
  "drive",
  "mail",
  "workspace:mail",
  "workspace:calendar",
  "workspace:contact",
] as const;

type RequiredScopeId = (typeof REQUIRED_SCOPE_IDS)[number];

function scopesForPreset(preset: IkTokenScopePreset): readonly RequiredScopeId[] {
  switch (preset) {
    case "all":
      return REQUIRED_SCOPE_IDS;
    case "kdrive":
      return ["drive"];
    case "mail":
      return ["mail", "workspace:mail", "workspace:contact"];
    case "calendar":
      return ["workspace:calendar"];
  }
}

function stepThreeBodyKey(preset: IkTokenScopePreset): string {
  if (preset === "all") return "sources.ikTokenStep3Body";
  if (preset === "kdrive") return "sources.ikTokenStep3BodyKdrive";
  if (preset === "mail") return "sources.ikTokenStep3BodyMail";
  return "sources.ikTokenStep3BodyCalendar";
}

function ikTokenScopeDescriptionKey(scope: RequiredScopeId): `sources.ikTokenScope_${string}` {
  return `sources.ikTokenScope_${scope.replace(/:/g, "_")}`;
}

const IK_TOKEN_MANAGER_URL =
  "https://manager.infomaniak.com/v3/ng/accounts/profile/api-token";

const IK_MANAGER_HOME_URL = "https://manager.infomaniak.com";

interface Step {
  titleKey: string;
  bodyKey: string;
  screenshot?: string;
  screenshotAltKey?: string;
}

const STEPS: Step[] = [
  {
    titleKey: "sources.ikTokenStep0Title",
    bodyKey: "sources.ikTokenStep0Body",
    screenshot: publicAssetUrl("onboarding/ik-token-step0-manager-settings.png"),
    screenshotAltKey: "sources.ikTokenStep0Alt",
  },
  {
    titleKey: "sources.ikTokenStep1DeveloperTitle",
    bodyKey: "sources.ikTokenStep1DeveloperBody",
    screenshot: publicAssetUrl("onboarding/ik-token-step1-developer-sidebar.png"),
    screenshotAltKey: "sources.ikTokenStep1DeveloperAlt",
  },
  {
    titleKey: "sources.ikTokenStep1Title",
    bodyKey: "sources.ikTokenStep1Body",
    screenshot: publicAssetUrl("onboarding/ik-token-step1.png"),
    screenshotAltKey: "sources.ikTokenStep1Alt",
  },
  {
    titleKey: "sources.ikTokenStep2Title",
    bodyKey: "sources.ikTokenStep2Body",
    screenshot: publicAssetUrl("onboarding/ik-token-step2.png"),
    screenshotAltKey: "sources.ikTokenStep2Alt",
  },
  {
    titleKey: "sources.ikTokenStep3Title",
    bodyKey: "sources.ikTokenStep3Body",
  },
  {
    titleKey: "sources.ikTokenStep4Title",
    bodyKey: "sources.ikTokenStep4Body",
    screenshot: publicAssetUrl("onboarding/ik-token-step4.png"),
    screenshotAltKey: "sources.ikTokenStep4Alt",
  },
  {
    titleKey: "sources.ikTokenStep5Title",
    bodyKey: "sources.ikTokenStep5Body",
  },
];

interface InfomaniakTokenSetupModalProps {
  onClose: () => void;
  onTokenSaved: () => void;
  /** Narrow the scope checklist for kDrive-only, Mail workspace, Calendar, or all five for Connect-all. */
  scopePreset?: IkTokenScopePreset;
}

export default function InfomaniakTokenSetupModal({
  onClose,
  onTokenSaved,
  scopePreset = "all",
}: InfomaniakTokenSetupModalProps) {
  const { t } = useI18n();
  const desktop = hasElectronBridge();
  const scopesForUi = useMemo(() => scopesForPreset(scopePreset), [scopePreset]);
  const step3ParagraphKey = useMemo(() => stepThreeBodyKey(scopePreset), [scopePreset]);
  const [step, setStep] = useState(0);
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isLastStep = step === STEPS.length - 1;
  const isFirstStep = step === 0;

  // Trap focus inside modal.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    return () => {
      prev?.focus();
    };
  }, []);

  // Auto-focus token input on last step.
  useEffect(() => {
    if (isLastStep) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isLastStep]);

  // Close on Escape.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const openManagerPage = useCallback(() => {
    if (desktop && window.electronAPI) {
      void window.electronAPI.openExternal(IK_TOKEN_MANAGER_URL);
    } else {
      window.open(IK_TOKEN_MANAGER_URL, "_blank", "noopener,noreferrer");
    }
  }, [desktop]);

  const openManagerHome = useCallback(() => {
    if (desktop && window.electronAPI) {
      void window.electronAPI.openExternal(IK_MANAGER_HOME_URL);
    } else {
      window.open(IK_MANAGER_HOME_URL, "_blank", "noopener,noreferrer");
    }
  }, [desktop]);

  const handleSave = useCallback(async () => {
    const trimmed = token.trim();
    if (!trimmed || trimmed.length < 20) {
      setTokenError(t("sources.ikTokenErrorTooShort"));
      return;
    }
    if (!desktop || !window.electronAPI) {
      toast.error(t("sources.ikTokenErrorDesktopOnly"));
      return;
    }
    setSaving(true);
    setTokenError(null);
    try {
      const result = await window.electronAPI.integrationSaveInfomaniakApiToken(trimmed);
      if (!result.ok) {
        setTokenError(result.reason ?? t("sources.ikTokenErrorSaveFailed"));
        return;
      }
      toast.success(t("sources.ikTokenSaveSuccess"));
      onTokenSaved();
      onClose();
    } catch (e) {
      setTokenError(e instanceof Error ? e.message : t("sources.ikTokenErrorSaveFailed"));
    } finally {
      setSaving(false);
    }
  }, [token, desktop, t, onTokenSaved, onClose]);

  const currentStep = STEPS[step];

  return (
    /* Backdrop */
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ik-token-modal-title"
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
            <img
              src={publicAssetUrl("brands/kdrive.png")}
              alt="Infomaniak"
              className="h-6 w-6 shrink-0 object-contain"
            />
            <h2
              id="ik-token-modal-title"
              className="text-base font-semibold text-text-primary leading-snug truncate"
            >
              {t("sources.ikTokenModalTitle")}
            </h2>
          </div>
          <button
            type="button"
            aria-label={t("sources.ikTokenModalClose")}
            onClick={onClose}
            className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-muted hover:bg-hover-overlay hover:text-text-primary transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M3 3l10 10M13 3L3 13"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
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
          {/* Step label */}
          <p className="text-xs font-medium text-accent uppercase tracking-wider">
            {t("sources.ikTokenStepLabel", {
              current: String(step + 1),
              total: String(STEPS.length),
            })}
          </p>

          {/* Step title */}
          <h3 className="text-lg font-semibold text-text-primary leading-snug">
            {t(currentStep.titleKey as Parameters<typeof t>[0])}
          </h3>

          {/* Step body */}
          <p className="text-sm text-muted leading-relaxed">
            {t(
              (step === 4 ? step3ParagraphKey : currentStep.bodyKey) as Parameters<typeof t>[0]
            )}
          </p>

          {/* Open Manager home — step 0 (dashboard, then settings gear) */}
          {step === 0 && (
            <button
              type="button"
              onClick={openManagerHome}
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
              {t("sources.ikTokenOpenManagerDashboardLink")}
            </button>
          )}

          {/* Scope checklist — scopes step uses preset-specific body */}
          {step === 4 && (
            <div className="rounded-xl border border-border bg-bg-secondary/60 p-4 space-y-2">
              <p className="text-xs font-semibold text-text-primary uppercase tracking-wider mb-3">
                {t(
                  (scopePreset === "all"
                    ? "sources.ikTokenScopeListTitle"
                    : "sources.ikTokenScopeListTitleSubset") as Parameters<typeof t>[0]
                )}
              </p>
              <ul className="space-y-1.5 list-none p-0 m-0">
                {scopesForUi.map((scope) => (
                  <li key={scope} className="flex items-start gap-2.5">
                    <span className="mt-0.5 shrink-0 flex items-center justify-center w-4 h-4 rounded-full bg-success-soft text-success">
                      <svg width="8" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true">
                        <path
                          d="M1 4l3 3 5-6"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span className="text-sm text-text-primary leading-snug flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <code className="font-mono text-accent text-xs bg-accent/10 px-1 py-0.5 rounded shrink-0">
                        {scope}
                      </code>
                      <span className="text-muted">
                        {t(ikTokenScopeDescriptionKey(scope) as Parameters<typeof t>[0])}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Screenshot */}
          {currentStep.screenshot && (
            <div className="rounded-xl overflow-hidden border border-border/70 shadow-sm shadow-black/10">
              <img
                src={currentStep.screenshot}
                alt={currentStep.screenshotAltKey ? t(currentStep.screenshotAltKey as Parameters<typeof t>[0]) : ""}
                className="w-full object-cover"
                loading="lazy"
              />
            </div>
          )}

          {/* Token input — last step */}
          {isLastStep && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="ik-token-input"
                  className="block text-sm font-medium text-text-primary"
                >
                  {t("sources.ikTokenInputLabel")}
                </label>
                <div className="relative">
                  <input
                    ref={inputRef}
                    id="ik-token-input"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={token}
                    onChange={(e) => {
                      setToken(e.target.value);
                      setTokenError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !saving) void handleSave();
                    }}
                    placeholder={t("sources.ikTokenInputPlaceholder")}
                    className={`w-full rounded-lg border px-3.5 py-2.5 text-sm font-mono bg-bg-secondary text-text-primary placeholder:text-muted/50 focus:outline-none focus:ring-2 transition-colors ${
                      tokenError
                        ? "border-error-line focus:ring-error/20"
                        : "border-border focus:border-accent focus:ring-accent/20"
                    }`}
                  />
                </div>
                {tokenError && (
                  <p className="text-xs text-error leading-snug">{tokenError}</p>
                )}
                <p className="text-xs text-muted leading-relaxed">
                  {t("sources.ikTokenInputHint")}
                </p>
              </div>

              {/* Revocation info card */}
              <div className="rounded-xl border border-warning-line/60 bg-warning-soft/30 p-4 space-y-3">
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
                    <path
                      d="M8 5v3.5M8 11h.01"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="space-y-1 min-w-0">
                    <p className="text-sm font-semibold text-text-primary leading-snug">
                      {t("sources.ikTokenRevokeTitle")}
                    </p>
                    <p className="text-xs text-muted leading-relaxed">
                      {t("sources.ikTokenRevokeBody")}
                    </p>
                  </div>
                </div>
                <div className="rounded-lg overflow-hidden border border-border/60">
                  <img
                    src={publicAssetUrl("onboarding/ik-token-revoke.png")}
                    alt={t("sources.ikTokenRevokeScreenshotAlt")}
                    className="w-full object-cover"
                    loading="lazy"
                  />
                </div>
                <button
                  type="button"
                  onClick={openManagerPage}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-warning hover:underline"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M6 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1v-3M10 2h4m0 0v4m0-4L7 9"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {t("sources.ikTokenRevokeLink")}
                </button>
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
            {isFirstStep ? t("sources.ikTokenCancel") : t("sources.ikTokenBack")}
          </button>

          {isLastStep ? (
            <button
              type="button"
              disabled={saving || !token.trim()}
              onClick={() => void handleSave()}
              className="text-sm font-semibold px-5 py-2 rounded-lg bg-button-primary text-white hover:bg-button-hover disabled:opacity-40 transition-colors"
            >
              {saving ? t("sources.ikTokenSaving") : t("sources.ikTokenSave")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className="text-sm font-semibold px-5 py-2 rounded-lg bg-button-primary text-white hover:bg-button-hover transition-colors"
            >
              {t("sources.ikTokenNext")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
