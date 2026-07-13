import { useCallback, useState } from "react";
import { useI18n } from "../i18n/I18nContext";
import { relayConnectorTokens } from "../assistant/connectorContext";
import { useWhatsAppConnectConfig } from "./useWhatsAppConnectConfig";
import { hasElectronBridge } from "../utils/platform";
import {
  trackIntegrationConnectCompleted,
  trackIntegrationConnectFailed,
  trackIntegrationConnectStarted,
} from "../telemetry/assistantTelemetry";
import { toastAppError } from "../utils/userGuidance";
import {
  getPrimarySettingsSectionDomId,
  requestOpenSettingsSection,
} from "../utils/settingsNav";
import { toast } from "sonner";

interface EmbeddedUnavailableToast {
  title: string;
  description: string;
  settingsSectionId?: string;
}

function describeEmbeddedUnavailableToast(
  reason: string | undefined,
  cloudSignedIn: boolean | null,
  t: (key: string) => string,
): EmbeddedUnavailableToast {
  const accountSectionId = getPrimarySettingsSectionDomId("account");

  if (reason === "not_logged_in" && cloudSignedIn === false) {
    return {
      title: t("sources.whatsappEmbeddedUnavailableSessionExpiredTitle"),
      description: t("sources.whatsappEmbeddedUnavailableSessionExpiredDesc"),
      settingsSectionId: accountSectionId,
    };
  }

  switch (reason) {
    case "not_logged_in":
      return {
        title: t("sources.whatsappEmbeddedUnavailableCloudLoginTitle"),
        description: t("sources.whatsappEmbeddedUnavailableCloudLoginDesc"),
        settingsSectionId: accountSectionId,
      };
    case "cloud_auth_disabled":
      return {
        title: t("sources.whatsappEmbeddedUnavailableCloudDisabledTitle"),
        description: t("sources.whatsappEmbeddedUnavailableCloudDisabledDesc"),
      };
    case "embedded_signup_not_configured":
      return {
        title: t("sources.whatsappEmbeddedUnavailableServerTitle"),
        description: t("sources.whatsappEmbeddedUnavailableServerDesc"),
      };
    default:
      return {
        title: t("sources.whatsappEmbeddedUnavailableGenericTitle"),
        description: t("sources.whatsappEmbeddedUnavailableGenericDesc"),
        settingsSectionId: accountSectionId,
      };
  }
}

function showEmbeddedUnavailableToast(
  payload: EmbeddedUnavailableToast,
  t: (key: string) => string,
): void {
  toastAppError(payload.title, {
    description: payload.description,
    duration: 11_000,
    action: payload.settingsSectionId
      ? {
          label: t("sources.openAccountSettings"),
          onClick: () => {
            if (payload.settingsSectionId) {
              requestOpenSettingsSection(payload.settingsSectionId);
            }
          },
        }
      : undefined,
  });
}

function describeEmbeddedSignupFailure(reason: string | undefined, t: (key: string) => string): string {
  switch (reason) {
    case "meta_signup_cancelled":
      return t("sources.whatsappEmbeddedConnectCancelled");
    case "meta_signup_window_closed":
      return t("sources.whatsappEmbeddedConnectWindowClosed");
    case "meta_signup_timeout":
      return t("sources.whatsappEmbeddedConnectTimeout");
    case "embedded_signup_not_configured":
      return t("sources.whatsappEmbeddedConnectNotConfigured");
    case "meta_signup_oauth_error":
    case "meta_signup_failed":
      return t("sources.whatsappEmbeddedConnectOAuthFailed");
    default:
      return reason
        ? `${t("sources.whatsappEmbeddedConnectFailed")} (${reason})`
        : t("sources.whatsappEmbeddedConnectFailed");
  }
}

/**
 * Launch Meta Embedded Signup and exchange the code via cloud-node.
 */
export function useWhatsAppEmbeddedConnect(onConfigured?: () => void) {
  const { t } = useI18n();
  const desktop = hasElectronBridge();
  const connectConfig = useWhatsAppConnectConfig();
  const [connecting, setConnecting] = useState(false);

  const connectBusiness = useCallback(async () => {
    if (!desktop || !window.electronAPI?.integrationLaunchWhatsAppEmbeddedSignup) {
      toastAppError(t("sources.whatsappCloudErrorDesktopOnly"));
      return false;
    }

    if (connectConfig.loading) {
      await connectConfig.refresh();
    }

    if (!connectConfig.embeddedSignupAvailable) {
      showEmbeddedUnavailableToast(
        describeEmbeddedUnavailableToast(
          connectConfig.reason,
          connectConfig.cloudSignedIn,
          t,
        ),
        t,
      );
      return false;
    }

    setConnecting(true);
    trackIntegrationConnectStarted("whatsapp");
    try {
      const launch = await window.electronAPI.integrationLaunchWhatsAppEmbeddedSignup();
      if (!launch.ok || !launch.code) {
        const message = describeEmbeddedSignupFailure(launch.reason, t);
        if (launch.reason !== "meta_signup_cancelled") {
          toastAppError(message, { duration: 8000 });
        }
        trackIntegrationConnectFailed("whatsapp", launch.reason || "launch_failed");
        return false;
      }

      const result = await window.electronAPI.integrationExchangeWhatsAppEmbeddedSignup({
        code: launch.code,
        code_source: launch.codeSource,
        oauth_redirect_uri: launch.oauthRedirectUri,
        phone_number_id: launch.phoneNumberId,
        business_account_id: launch.businessAccountId,
        display_phone_number: launch.displayPhoneNumber,
      });

      if (!result.ok) {
        toastAppError(describeEmbeddedSignupFailure(result.reason, t), { duration: 8000 });
        trackIntegrationConnectFailed("whatsapp", result.reason || "exchange_failed");
        return false;
      }

      void relayConnectorTokens();
      trackIntegrationConnectCompleted("whatsapp", "embedded_signup");
      toast.success(
        result.displayPhoneNumber
          ? t("sources.whatsappCloudSaveSuccessWithNumber", { number: result.displayPhoneNumber })
          : t("sources.whatsappCloudSaveSuccess"),
      );
      if (result.webhookRegistrationFailed) {
        toast.warning(t("sources.whatsappCloudWebhookRegisterWarning"), { duration: 10_000 });
      }
      onConfigured?.();
      return true;
    } catch {
      toastAppError(t("sources.whatsappEmbeddedConnectFailed"), { duration: 8000 });
      trackIntegrationConnectFailed("whatsapp", "exception");
      return false;
    } finally {
      setConnecting(false);
    }
  }, [connectConfig, desktop, onConfigured, t]);

  return {
    connecting,
    connectConfig,
    connectBusiness,
  };
}
