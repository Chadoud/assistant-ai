import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "../../i18n/I18nContext";
import { relayConnectorTokens } from "../../assistant/connectorContext";
import type { WhatsAppConnectConfig } from "../../hooks/useWhatsAppConnectConfig";
import { hasElectronBridge } from "../../utils/platform";
import { copyTextToClipboard } from "../../utils/clipboard";
import { parseWhatsAppCredentialPaste } from "../../utils/whatsappCredentialPaste";
import ModalShell from "../ModalShell";
import WhatsAppBusinessHealthPanel from "./WhatsAppBusinessHealthPanel";

const META_DEVELOPERS_URL = "https://developers.facebook.com/apps/";

interface WhatsAppBusinessSetupModalProps {
  onClose: () => void;
  onConfigured: () => void;
  connectConfig: WhatsAppConnectConfig;
  connecting: boolean;
  connectBusiness: () => Promise<boolean>;
}

/**
 * Minimal WhatsApp Business setup — Meta one-click connect plus optional manual paste for dev WABAs.
 */
export default function WhatsAppBusinessSetupModal({
  onClose,
  onConfigured,
  connectConfig,
  connecting,
  connectBusiness,
}: WhatsAppBusinessSetupModalProps) {
  const { t } = useI18n();
  const desktop = hasElectronBridge();

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pasteBlob, setPasteBlob] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!desktop || !window.electronAPI?.integrationGetWhatsAppWebhookConfig) return;
    void window.electronAPI.integrationGetWhatsAppWebhookConfig().then((res) => {
      if (res?.ok && res.webhook_url) setWebhookUrl(res.webhook_url);
    });
  }, [desktop]);

  const applyPaste = useCallback(() => {
    const parsed = parseWhatsAppCredentialPaste(pasteBlob);
    if (parsed.phoneNumberId) setPhoneNumberId(parsed.phoneNumberId);
    if (parsed.businessAccountId) setBusinessAccountId(parsed.businessAccountId);
    if (parsed.accessToken) setAccessToken(parsed.accessToken);
    if (!parsed.phoneNumberId && !parsed.businessAccountId && !parsed.accessToken) {
      setFormError(t("sources.whatsappCloudPasteUnrecognized"));
      return;
    }
    setFormError(null);
    toast.success(t("sources.whatsappCloudPasteApplied"));
  }, [pasteBlob, t]);

  const copyWebhook = useCallback(async () => {
    if (!webhookUrl) return;
    const ok = await copyTextToClipboard(webhookUrl);
    if (ok) toast.success(t("sources.whatsappCloudWebhookCopied"));
  }, [t, webhookUrl]);

  const handleManualSave = useCallback(async () => {
    if (!desktop || !window.electronAPI?.integrationSaveWhatsAppCloudCredentials) {
      setFormError(t("sources.whatsappCloudErrorDesktopOnly"));
      return;
    }
    if (!phoneNumberId.trim() || !accessToken.trim() || !businessAccountId.trim()) {
      setFormError(t("sources.whatsappCloudErrorMissing"));
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const result = await window.electronAPI.integrationSaveWhatsAppCloudCredentials({
        phone_number_id: phoneNumberId.trim(),
        access_token: accessToken.trim(),
        business_account_id: businessAccountId.trim(),
      });
      if (result.ok) {
        void relayConnectorTokens();
        toast.success(
          result.displayPhoneNumber
            ? t("sources.whatsappCloudSaveSuccessWithNumber", { number: result.displayPhoneNumber })
            : t("sources.whatsappCloudSaveSuccess"),
        );
        if (result.webhookRegistrationFailed) {
          toast.warning(t("sources.whatsappCloudWebhookRegisterWarning"), { duration: 10_000 });
        }
        onConfigured();
        onClose();
      } else {
        setFormError(result.reason || t("sources.whatsappCloudSaveFailed"));
      }
    } catch {
      setFormError(t("sources.whatsappCloudSaveFailed"));
    } finally {
      setSaving(false);
    }
  }, [
    accessToken,
    businessAccountId,
    desktop,
    onClose,
    onConfigured,
    phoneNumberId,
    t,
  ]);

  const openMetaDevelopers = useCallback(() => {
    if (desktop && window.electronAPI) {
      void window.electronAPI.openExternal(META_DEVELOPERS_URL);
    } else {
      window.open(META_DEVELOPERS_URL, "_blank", "noopener,noreferrer");
    }
  }, [desktop]);

  const embeddedAvailable = connectConfig.embeddedSignupAvailable;

  return (
    <ModalShell title={t("sources.whatsappBusinessModalTitle")} onClose={onClose} maxWidthClass="max-w-lg">
      <div className="space-y-4 text-sm text-text-primary">
        <p className="text-muted leading-relaxed">{t("sources.whatsappBusinessModalIntro")}</p>

        <WhatsAppBusinessHealthPanel />

        {connectConfig.loading ? (
          <p className="text-xs text-muted">{t("sources.whatsappEmbeddedConnectChecking")}</p>
        ) : embeddedAvailable ? (
          <button
            type="button"
            disabled={connecting}
            onClick={() => void connectBusiness()}
            className="text-sm font-medium px-3 py-2 rounded-lg border border-accent-line bg-accent-light text-accent hover:bg-accent/15 disabled:opacity-40 w-full"
          >
            {connecting
              ? t("sources.whatsappEmbeddedConnectBusy")
              : t("sources.whatsappEmbeddedConnectButton")}
          </button>
        ) : (
          <p className="text-xs text-muted leading-relaxed">
            {t("sources.whatsappEmbeddedConnectNotConfigured")}
          </p>
        )}

        {webhookUrl ? (
          <div className="rounded-lg border border-border bg-bg-secondary px-3 py-2 space-y-2">
            <p className="text-xs font-medium text-text-secondary">
              {t("sources.whatsappCloudWebhookUrlLabel")}
            </p>
            <p className="text-xs text-text-primary break-all font-mono">{webhookUrl}</p>
            <button
              type="button"
              onClick={() => void copyWebhook()}
              className="text-xs font-medium px-2.5 py-1 rounded-md border border-border hover:bg-hover-overlay"
            >
              {t("sources.whatsappCloudCopyWebhook")}
            </button>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-xs font-medium text-muted hover:text-text-primary"
        >
          {showAdvanced
            ? t("sources.whatsappAdvancedSetupHide")
            : t("sources.whatsappAdvancedSetupShow")}
        </button>

        {showAdvanced ? (
          <div className="space-y-3 border-t border-border pt-3">
            <textarea
              value={pasteBlob}
              onChange={(e) => setPasteBlob(e.target.value)}
              placeholder={t("sources.whatsappCloudPastePlaceholder")}
              rows={2}
              className="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-xs font-mono resize-y"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={applyPaste}
              disabled={!pasteBlob.trim()}
              className="text-xs font-medium px-2.5 py-1 rounded-md border border-border hover:bg-hover-overlay disabled:opacity-40"
            >
              {t("sources.whatsappCloudPasteApply")}
            </button>
            <input
              type="text"
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              placeholder={t("sources.whatsappCloudPhoneNumberIdPlaceholder")}
              className="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm"
              autoComplete="off"
            />
            <input
              type="text"
              value={businessAccountId}
              onChange={(e) => setBusinessAccountId(e.target.value)}
              placeholder={t("sources.whatsappCloudWabaPlaceholder")}
              className="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm"
              autoComplete="off"
            />
            <input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={t("sources.whatsappCloudAccessTokenPlaceholder")}
              className="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm"
              autoComplete="off"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openMetaDevelopers}
                className="text-xs font-medium text-accent hover:underline"
              >
                {t("sources.whatsappCloudOpenMeta")}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleManualSave()}
                className="text-xs font-medium px-2.5 py-1 rounded-md border border-accent-line bg-accent-light text-accent hover:bg-accent/15 disabled:opacity-40"
              >
                {saving ? t("sources.whatsappCloudSaving") : t("sources.whatsappCloudSave")}
              </button>
            </div>
          </div>
        ) : null}

        {formError ? <p className="text-xs text-error">{formError}</p> : null}
      </div>
    </ModalShell>
  );
}
