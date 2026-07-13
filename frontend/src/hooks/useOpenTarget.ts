import { useCallback } from "react";
import { toast } from "sonner";
import type { MemoryOpenTargetResponse } from "../api/memory";
import { useConversations } from "./useConversations";
import { useI18n } from "../i18n/I18nContext";

type OpenTargetPayload = MemoryOpenTargetResponse;

/**
 * Open an external URL or jump to the source conversation from a resolved target.
 */
export function useOpenTarget(onOpenConversation?: () => void) {
  const { setActive } = useConversations();
  const { t } = useI18n();

  const openTarget = useCallback(
    async (fetchTarget: () => Promise<OpenTargetPayload>) => {
      try {
        const target = await fetchTarget();
        if (target.url) {
          if (window.electronAPI?.openExternal) {
            await window.electronAPI.openExternal(target.url);
          } else {
            window.open(target.url, "_blank", "noopener,noreferrer");
          }
          return;
        }
        if (target.conversation_id) {
          setActive(target.conversation_id);
          onOpenConversation?.();
          return;
        }
        toast.error(t("memories.openUnavailable"));
      } catch {
        toast.error(t("memories.openFailed"));
      }
    },
    [onOpenConversation, setActive, t],
  );

  return { openTarget };
}
