import { useI18n } from "../i18n/I18nContext";

const CONSENT_KEY = "exosites.codegen.consent.v1";

export function hasCodegenConsent(): boolean {
  try {
    return sessionStorage.getItem(CONSENT_KEY) === "always" || localStorage.getItem(CONSENT_KEY) === "always";
  } catch {
    return false;
  }
}

export function grantCodegenConsent(scope: "session" | "always"): void {
  try {
    if (scope === "always") localStorage.setItem(CONSENT_KEY, "always");
    else sessionStorage.setItem(CONSENT_KEY, "session");
  } catch {
    /* ignore */
  }
}

interface CodegenConsentModalProps {
  open: boolean;
  onAllow: (scope: "session" | "always") => void;
  onDeny: () => void;
}

/** One-time consent before writing projects and running npm install. */
export default function CodegenConsentModal({ open, onAllow, onDeny }: CodegenConsentModalProps) {
  const { t } = useI18n();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal>
      <div className="max-w-md rounded-xl border border-border bg-bg-primary p-5 shadow-xl">
        <h2 className="text-base font-semibold text-text-primary">{t("assistant.codegen.consentTitle")}</h2>
        <p className="mt-2 text-sm text-muted">{t("assistant.codegen.consentBody")}</p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-hover-overlay" onClick={onDeny}>
            {t("assistant.codegen.consentDeny")}
          </button>
          <button
            type="button"
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-hover-overlay"
            onClick={() => onAllow("session")}
          >
            {t("assistant.codegen.consentOnce")}
          </button>
          <button
            type="button"
            className="rounded-lg bg-button-primary px-3 py-1.5 text-sm text-white"
            onClick={() => onAllow("always")}
          >
            {t("assistant.codegen.consentAlways")}
          </button>
        </div>
      </div>
    </div>
  );
}
