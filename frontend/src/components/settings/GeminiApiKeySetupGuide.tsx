import { useState } from "react";
import { GEMINI_AI_STUDIO_API_KEY_URL } from "../../constants";
import { useI18n } from "../../i18n/I18nContext";
import { PRIMARY_BTN_CLASS } from "../../utils/styles";
import { isGeminiKeyFormatPlausible, normalizeGeminiApiKey } from "../../utils/geminiApiKey";

/** Public onboarding asset (Vite `base` + `public/onboarding/`). */
const GEMINI_ONBOARDING_IMG_SRC = `${import.meta.env.BASE_URL}onboarding/gemini-ai-studio-api-keys.png`;

interface GeminiApiKeySetupGuideProps {
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  /** Stable id for the key input (a11y). */
  inputId?: string;
}

/**
 * Step-by-step Gemini API key onboarding — shared by welcome setup and Settings.
 */
export default function GeminiApiKeySetupGuide({
  apiKey,
  onApiKeyChange,
  inputId = "gemini-api-key",
}: GeminiApiKeySetupGuideProps) {
  const { t } = useI18n();
  const [keyVisible, setKeyVisible] = useState(false);
  const trimmed = apiKey.trim();
  const formatOk = isGeminiKeyFormatPlausible(apiKey);

  return (
    <div className="space-y-5">
      <a
        href={GEMINI_AI_STUDIO_API_KEY_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`${PRIMARY_BTN_CLASS} w-full text-center`}
      >
        {t("welcome.geminiFreeKeyCta")}
      </a>

      <figure className="space-y-2">
        <figcaption className="text-xs font-medium text-text-primary">
          {t("welcome.geminiSetupVisualTitle")}
        </figcaption>
        <img
          src={GEMINI_ONBOARDING_IMG_SRC}
          alt={t("welcome.geminiSetupScreenshotAlt")}
          loading="lazy"
          decoding="async"
          className="max-w-full rounded-lg border border-border bg-bg-primary shadow-sm"
        />
        <p className="text-2xs text-muted leading-relaxed">{t("welcome.geminiSetupScreenshotCaption")}</p>
      </figure>

      <div className="space-y-2">
        <label htmlFor={inputId} className="block text-sm font-medium text-text-primary">
          {t("welcome.geminiApiKeyLabel")}
        </label>
        <div className="flex gap-2">
          <input
            id={inputId}
            type={keyVisible ? "text" : "password"}
            value={apiKey}
            onChange={(e) => onApiKeyChange(normalizeGeminiApiKey(e.target.value))}
            placeholder={t("welcome.geminiApiKeyPlaceholder")}
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-xl border border-border bg-bg-secondary px-3 py-2.5 text-sm text-text-primary placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent font-mono"
          />
          <button
            type="button"
            onClick={() => setKeyVisible((v) => !v)}
            className="shrink-0 rounded-xl border border-border bg-bg-secondary px-3 py-2 text-xs text-text-secondary hover:bg-hover-overlay"
            title={keyVisible ? t("welcome.geminiHideKey") : t("welcome.geminiShowKey")}
          >
            {keyVisible ? t("welcome.geminiHideKey") : t("welcome.geminiShowKey")}
          </button>
        </div>
        <p className="text-xs text-muted leading-relaxed">{t("welcome.geminiKeyPrivacyLine")}</p>
        {!trimmed ? (
          <p className="text-xs text-muted leading-relaxed">{t("welcome.geminiKeyRequiredHint")}</p>
        ) : formatOk ? (
          <p className="rounded-lg border-2 border-[#16a34a] bg-white px-3 py-2 text-xs leading-relaxed text-[#166534]">
            ✓ {t("welcome.geminiKeyFormatOk")}
          </p>
        ) : (
          <p className="rounded-lg border-2 border-[#dc2626] bg-white px-3 py-2 text-xs leading-relaxed text-[#991b1b]">
            {t("welcome.geminiKeyInvalidFormat")}
          </p>
        )}
      </div>

      <ol className="list-decimal space-y-2 pl-5 text-sm text-muted marker:font-medium marker:text-text-secondary">
        <li>{t("welcome.geminiFreeKeyStep1")}</li>
        <li>{t("welcome.geminiFreeKeyStep2")}</li>
        <li>{t("welcome.geminiFreeKeyStep3")}</li>
      </ol>

      <p className="text-xs text-muted leading-relaxed">{t("welcome.geminiFreeTierHint")}</p>
    </div>
  );
}
