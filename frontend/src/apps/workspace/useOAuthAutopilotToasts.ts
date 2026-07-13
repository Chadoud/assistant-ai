import { useEffect } from "react";
import { toast } from "sonner";

type TFunction = (key: string, params?: Record<string, string | number>) => string;

/** Surface AI self-connect (OAuth autopilot) progress toasts. */
export function useOAuthAutopilotToasts(t: TFunction) {
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onOAuthAutopilotProgress?.((detail) => {
      const provider = detail.label || detail.providerId || "";
      if (detail.needsUser) {
        toast.warning(t("assistant.autopilotNeedsUser", { provider }), {
          description: detail.message,
          duration: 12000,
        });
        return;
      }
      if (detail.status === "error") {
        toast.error(t("assistant.voiceConnectionConnectFailed", { provider }), {
          description: detail.message,
        });
        return;
      }
      toast.message(t("assistant.autopilotConnecting", { provider }), {
        description: detail.message,
        id: "oauth-autopilot-progress",
      });
    });
    return unsubscribe;
  }, [t]);
}
