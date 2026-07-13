import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { publicAssetUrl } from "../../constants";
import { useI18n } from "../../i18n/I18nContext";
import { hasElectronBridge } from "../../utils/platform";
import { copyTextToClipboard } from "../../utils/clipboard";

const SLACK_APPS_URL = "https://api.slack.com/apps";
const SLACK_LOOPBACK_REDIRECT_HINT = "http://127.0.0.1";

/** Must match `SLACK_USER_SCOPES` in `electron/integrations/slack.js`. */
const SLACK_USER_SCOPES = [
  "channels:read",
  "groups:read",
  "im:read",
  "mpim:read",
  "channels:history",
  "groups:history",
  "im:history",
  "mpim:history",
  "chat:write",
  "search:read",
  "users:read",
  "files:read",
] as const;

/** Pre-filled Slack app manifest — redirect URL + all user scopes in one paste. */
function buildSlackAppManifestJson(): string {
  return JSON.stringify(
    {
      display_information: {
        name: "Exo",
        description: "Personal assistant integration for your Slack workspace",
      },
      oauth_config: {
        redirect_urls: [SLACK_LOOPBACK_REDIRECT_HINT],
        scopes: {
          user: [...SLACK_USER_SCOPES],
        },
      },
      settings: {
        org_deploy_enabled: false,
        socket_mode_enabled: false,
        token_rotation_enabled: false,
      },
    },
    null,
    2
  );
}

interface Step {
  titleKey: `sources.${string}`;
  bodyKey: `sources.${string}`;
}

const STEPS: Step[] = [
  { titleKey: "sources.slackOAuthStep0Title", bodyKey: "sources.slackOAuthStep0Body" },
  { titleKey: "sources.slackOAuthStep1Title", bodyKey: "sources.slackOAuthStep1Body" },
  { titleKey: "sources.slackOAuthStep2Title", bodyKey: "sources.slackOAuthStep2Body" },
  { titleKey: "sources.slackOAuthStep3Title", bodyKey: "sources.slackOAuthStep3Body" },
  { titleKey: "sources.slackOAuthStep4Title", bodyKey: "sources.slackOAuthStep4Body" },
];

type SetupChoiceVariant = "pick" | "skip" | "neutral";

interface SetupChoice {
  textKey: `sources.${string}`;
  variant: SetupChoiceVariant;
}

const STEP0_CHOICES: SetupChoice[] = [
  { textKey: "sources.slackOAuthStep0Item1", variant: "neutral" },
  { textKey: "sources.slackOAuthStep0Item2", variant: "pick" },
  { textKey: "sources.slackOAuthStep0Item3", variant: "neutral" },
  { textKey: "sources.slackOAuthStep0Item4", variant: "neutral" },
  { textKey: "sources.slackOAuthStep0Item5", variant: "neutral" },
];

const STEP1_CHOICES: SetupChoice[] = [
  { textKey: "sources.slackOAuthStep1Item1", variant: "neutral" },
  { textKey: "sources.slackOAuthStep1Item2", variant: "neutral" },
  { textKey: "sources.slackOAuthStep1Item3", variant: "neutral" },
];

const STEP2_CHOICES: SetupChoice[] = [
  { textKey: "sources.slackOAuthStep2Item1", variant: "pick" },
  { textKey: "sources.slackOAuthStep2Item2", variant: "neutral" },
  { textKey: "sources.slackOAuthStep2Item3", variant: "neutral" },
];

const STEP3_CHOICES: SetupChoice[] = [
  { textKey: "sources.slackOAuthStep3Item1", variant: "skip" },
  { textKey: "sources.slackOAuthStep3Item2", variant: "neutral" },
  { textKey: "sources.slackOAuthStep3Item3", variant: "neutral" },
];

function choiceBadgeClass(variant: SetupChoiceVariant): string {
  if (variant === "pick") return "border-accent-line/70 bg-accent-light text-accent";
  if (variant === "skip") return "border-warning-line/70 bg-warning-soft/40 text-warning";
  return "border-border bg-bg-secondary text-muted";
}

function choiceRowClass(variant: SetupChoiceVariant): string {
  if (variant === "pick") return "border-accent-line/50 bg-accent-light/20";
  if (variant === "skip") return "border-warning-line/50 bg-warning-soft/20";
  return "border-border bg-bg-secondary/60";
}

/** Opens api.slack.com/apps in the system browser. */
function OpenSlackAppsButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-lg border border-accent-line bg-accent-light px-4 py-2.5 text-sm font-medium text-accent hover:bg-accent/15 transition-colors"
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
      {label}
    </button>
  );
}

/** Numbered pick/skip list for Slack developer-console steps. */
function SetupChoiceList({
  items,
  pickLabel,
  skipLabel,
  t,
}: {
  items: SetupChoice[];
  pickLabel: string;
  skipLabel: string;
  t: (key: string) => string;
}) {
  return (
    <ol className="space-y-2.5">
      {items.map((item, index) => (
        <li
          key={item.textKey}
          className={`rounded-xl border px-4 py-3 ${choiceRowClass(item.variant)}`}
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-card text-xs font-semibold text-text-primary">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm text-text-primary leading-relaxed">{t(item.textKey)}</p>
              {item.variant !== "neutral" && (
                <span
                  className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${choiceBadgeClass(item.variant)}`}
                >
                  {item.variant === "pick" ? pickLabel : skipLabel}
                </span>
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

interface SlackOAuthSetupModalProps {
  onClose: () => void;
  onConfigured: () => void;
}

/**
 * Guided setup for a Slack OAuth app — credentials are saved locally (like Notion).
 */
export default function SlackOAuthSetupModal({ onClose, onConfigured }: SlackOAuthSetupModalProps) {
  const { t } = useI18n();
  const desktop = hasElectronBridge();
  const [step, setStep] = useState(0);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedRedirect, setCopiedRedirect] = useState(false);
  const [copiedManifest, setCopiedManifest] = useState(false);
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

  const openSlackApps = useCallback(() => {
    if (desktop && window.electronAPI) {
      void window.electronAPI.openExternal(SLACK_APPS_URL);
    } else {
      window.open(SLACK_APPS_URL, "_blank", "noopener,noreferrer");
    }
  }, [desktop]);

  const copyRedirectHint = useCallback(async () => {
    const ok = await copyTextToClipboard(SLACK_LOOPBACK_REDIRECT_HINT);
    if (ok) {
      setCopiedRedirect(true);
      setTimeout(() => setCopiedRedirect(false), 1800);
      return;
    }
    setCopiedRedirect(false);
    redirectUriInputRef.current?.select();
  }, []);

  const copyAppManifest = useCallback(async () => {
    const ok = await copyTextToClipboard(buildSlackAppManifestJson());
    if (ok) {
      setCopiedManifest(true);
      setTimeout(() => setCopiedManifest(false), 1800);
    }
  }, []);

  const handleSaveAndConnect = useCallback(async () => {
    const id = clientId.trim();
    const secret = clientSecret.trim();
    if (!id || !secret) {
      setFormError(t("sources.slackOAuthErrorMissing"));
      return;
    }
    if (!desktop || !window.electronAPI) {
      toast.error(t("sources.slackOAuthErrorDesktopOnly"));
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const saved = await window.electronAPI.integrationSaveSlackOAuthClient({
        clientId: id,
        clientSecret: secret,
      });
      if (!saved.ok) {
        setFormError(saved.reason ?? t("sources.slackOAuthErrorSaveFailed"));
        return;
      }
      const connected = await window.electronAPI.integrationConnect({ providerId: "slack" });
      if (!connected.ok) {
        toast.error(t("sources.slackConnectFailed"), { description: connected.reason ?? "" });
        onConfigured();
        onClose();
        return;
      }
      toast.success(t("sources.slackConnectSuccess"));
      onConfigured();
      onClose();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t("sources.slackOAuthErrorSaveFailed"));
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
      aria-labelledby="slack-oauth-modal-title"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl border border-border bg-bg-card shadow-2xl shadow-black/30 flex flex-col overflow-hidden"
        style={{ maxHeight: "90vh" }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <img src={publicAssetUrl("brands/slack.png")} alt="Slack" className="h-6 w-6 shrink-0 object-contain" />
            <h2 id="slack-oauth-modal-title" className="text-base font-semibold text-text-primary leading-snug truncate">
              {t("sources.slackOAuthModalTitle")}
            </h2>
          </div>
          <button
            type="button"
            aria-label={t("sources.slackOAuthModalClose")}
            onClick={onClose}
            className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-muted hover:bg-hover-overlay hover:text-text-primary transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        </div>

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

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          <p className="text-xs font-medium text-accent uppercase tracking-wider">
            {t("sources.slackOAuthStepLabel", {
              current: String(step + 1),
              total: String(STEPS.length),
            })}
          </p>

          <h3 className="text-lg font-semibold text-text-primary leading-snug">{t(currentStep.titleKey)}</h3>
          <p className="text-sm text-muted leading-relaxed">{t(currentStep.bodyKey)}</p>

          {isFirstStep && (
            <>
              <OpenSlackAppsButton
                label={t("sources.slackOAuthOpenDashboardLink")}
                onClick={openSlackApps}
              />
              <SetupChoiceList
                items={STEP0_CHOICES}
                pickLabel={t("sources.slackOAuthPickBadge")}
                skipLabel={t("sources.slackOAuthSkipBadge")}
                t={t}
              />
              <div className="rounded-xl border border-border bg-bg-secondary/80 p-4">
                <p className="text-sm text-muted leading-relaxed">{t("sources.slackOAuthStep0Callout")}</p>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <SetupChoiceList
                items={STEP1_CHOICES}
                pickLabel={t("sources.slackOAuthPickBadge")}
                skipLabel={t("sources.slackOAuthSkipBadge")}
                t={t}
              />
            </>
          )}

          {step === 2 && (
            <>
              <div className="rounded-xl border border-accent-line/50 bg-accent-light/20 p-4 space-y-3">
                <p className="text-sm font-semibold text-text-primary leading-snug">
                  {t("sources.slackOAuthManifestFastTitle")}
                </p>
                <p className="text-sm text-muted leading-relaxed">{t("sources.slackOAuthManifestFastBody")}</p>
                <ol className="list-decimal pl-5 text-sm text-muted space-y-1.5 leading-relaxed">
                  <li>{t("sources.slackOAuthManifestFastItem1")}</li>
                  <li>{t("sources.slackOAuthManifestFastItem2")}</li>
                  <li>{t("sources.slackOAuthManifestFastItem3")}</li>
                </ol>
                <button
                  type="button"
                  onClick={() => void copyAppManifest()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-accent-line bg-accent-light px-3 py-2 text-sm font-medium text-accent hover:bg-accent/15 transition-colors"
                >
                  {copiedManifest ? t("sources.slackOAuthManifestCopied") : t("sources.slackOAuthManifestCopy")}
                </button>
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                {t("sources.slackOAuthScopesManualDivider")}
              </p>
              <SetupChoiceList
                items={STEP2_CHOICES}
                pickLabel={t("sources.slackOAuthPickBadge")}
                skipLabel={t("sources.slackOAuthSkipBadge")}
                t={t}
              />
              <div className="flex flex-wrap gap-2" dir="ltr">
                {SLACK_USER_SCOPES.map((scope) => (
                  <span
                    key={scope}
                    className="inline-flex items-center rounded-md border border-border bg-bg-secondary px-2.5 py-1 text-xs font-mono text-text-primary"
                  >
                    {scope}
                  </span>
                ))}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <OpenSlackAppsButton
                label={t("sources.slackOAuthOpenDashboardLink")}
                onClick={openSlackApps}
              />
              <SetupChoiceList
                items={STEP3_CHOICES}
                pickLabel={t("sources.slackOAuthPickBadge")}
                skipLabel={t("sources.slackOAuthSkipBadge")}
                t={t}
              />
              <div className="rounded-xl border border-warning-line/60 bg-warning-soft/30 p-4">
                <p className="text-sm text-muted leading-relaxed">{t("sources.slackOAuthStep3Callout")}</p>
              </div>
            </>
          )}

          {step === 1 && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-text-primary uppercase tracking-wider">
                {t("sources.slackOAuthRedirectLabel")}
              </label>
              <div className="flex items-stretch gap-2" dir="ltr">
                <input
                  ref={redirectUriInputRef}
                  type="text"
                  readOnly
                  value={SLACK_LOOPBACK_REDIRECT_HINT}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 rounded-lg border border-border bg-bg-secondary px-3.5 py-2.5 text-sm font-mono text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
                <button
                  type="button"
                  onClick={() => void copyRedirectHint()}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-accent-line bg-accent-light px-3 py-2 text-sm font-medium text-accent hover:bg-accent/15 transition-colors"
                >
                  {copiedRedirect ? t("sources.slackOAuthCopied") : t("sources.slackOAuthCopy")}
                </button>
              </div>
              <p className="text-xs text-muted leading-relaxed">{t("sources.slackOAuthRedirectHint")}</p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="slack-client-id" className="block text-sm font-medium text-text-primary">
                  {t("sources.slackOAuthClientIdLabel")}
                </label>
                <input
                  ref={clientIdInputRef}
                  id="slack-client-id"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={clientId}
                  onChange={(e) => {
                    setClientId(e.target.value);
                    setFormError(null);
                  }}
                  placeholder={t("sources.slackOAuthClientIdPlaceholder")}
                  className={`w-full rounded-lg border px-3.5 py-2.5 text-sm font-mono bg-bg-secondary text-text-primary placeholder:text-muted/50 focus:outline-none focus:ring-2 transition-colors ${
                    formError
                      ? "border-error-line focus:ring-error/20"
                      : "border-border focus:border-accent focus:ring-accent/20"
                  }`}
                  dir="ltr"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="slack-client-secret" className="block text-sm font-medium text-text-primary">
                  {t("sources.slackOAuthClientSecretLabel")}
                </label>
                <input
                  id="slack-client-secret"
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
                  placeholder={t("sources.slackOAuthClientSecretPlaceholder")}
                  className={`w-full rounded-lg border px-3.5 py-2.5 text-sm font-mono bg-bg-secondary text-text-primary placeholder:text-muted/50 focus:outline-none focus:ring-2 transition-colors ${
                    formError
                      ? "border-error-line focus:ring-error/20"
                      : "border-border focus:border-accent focus:ring-accent/20"
                  }`}
                  dir="ltr"
                />
                {formError && <p className="text-xs text-error leading-snug">{formError}</p>}
                <p className="text-xs text-muted leading-relaxed">{t("sources.slackOAuthClientSecretHint")}</p>
              </div>

              <div className="rounded-xl border border-warning-line/60 bg-warning-soft/30 p-4 space-y-2">
                <p className="text-sm font-semibold text-text-primary leading-snug">{t("sources.slackOAuthReconnectTitle")}</p>
                <p className="text-xs text-muted leading-relaxed">{t("sources.slackOAuthReconnectBody")}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4 shrink-0">
          <button
            type="button"
            onClick={() => (isFirstStep ? onClose() : setStep((s) => s - 1))}
            className="text-sm px-4 py-2 rounded-lg border border-border text-muted hover:bg-hover-overlay transition-colors"
          >
            {isFirstStep ? t("sources.slackOAuthCancel") : t("sources.slackOAuthBack")}
          </button>

          {isLastStep ? (
            <button
              type="button"
              disabled={saving || !clientId.trim() || !clientSecret.trim()}
              onClick={() => void handleSaveAndConnect()}
              className="text-sm font-semibold px-5 py-2 rounded-lg bg-button-primary text-white hover:bg-button-hover disabled:opacity-40 transition-colors"
            >
              {saving ? t("sources.slackOAuthSaving") : t("sources.slackOAuthSaveConnect")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className="text-sm font-semibold px-5 py-2 rounded-lg bg-button-primary text-white hover:bg-button-hover transition-colors"
            >
              {t("sources.slackOAuthNext")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
