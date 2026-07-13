import { useEffect } from "react";
import { auditSystemCommand } from "../systemCommands/audit";
import { VALID_TABS } from "../systemCommands/catalogMeta";
import type { AppTab } from "../systemCommands/catalogMeta";
import type { MainNavTab } from "./useMainNavItems";

type SystemCommandDelegatePayload = {
  v: number;
  commandId: string;
  args?: { tab?: string };
};

/**
 * Subscribes to Electron `systemCommand:execute` delegation (navigate tab, open help/tour).
 */
export function useSystemCommandDelegate(options: {
  requestTab: (tab: MainNavTab) => void;
  openHelpModal: () => void;
  openTour: () => void;
}): void {
  const { requestTab, openHelpModal, openTour } = options;

  useEffect(() => {
    const sub = window.electronAPI?.onSystemCommandDelegate?.((cmd: SystemCommandDelegatePayload) => {
      if (!cmd || cmd.v !== 1) return;
      switch (cmd.commandId) {
        case "navigate_tab": {
          const tabArg = cmd.args?.tab;
          if (tabArg && VALID_TABS.has(tabArg as AppTab)) {
            requestTab(tabArg as MainNavTab);
          } else {
            auditSystemCommand({
              commandId: cmd.commandId,
              outcome: "skipped",
              detail: tabArg ? `invalid_tab:${tabArg}` : "missing_tab",
            });
          }
          break;
        }
        case "open_help":
          openHelpModal();
          break;
        case "open_tour":
          openTour();
          break;
        default:
          auditSystemCommand({
            commandId: cmd.commandId,
            outcome: "skipped",
            detail: "delegate_not_handled_in_renderer",
          });
          break;
      }
    });
    return () => {
      sub?.();
    };
  }, [requestTab, openHelpModal, openTour]);
}
