import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { AppSettings } from "../types/settings";
import {
  ASSISTANT_MEMORY_SAVED_EVENT,
  ASSISTANT_PERMISSIONS_PROMPT_EVENT,
  ASSISTANT_REPLY_COMPLETE_EVENT,
  ASSISTANT_TOOL_FOLLOWUP_READY_EVENT,
} from "../constants";
import { useI18n } from "../i18n/I18nContext";
import ModalShell from "./ModalShell";
import { MODAL_FOOTER_ROW_CLASS } from "../utils/styles";
import { auditSystemCommand } from "../systemCommands/audit";
import {
  assistantCommandNeedsHighRiskConfirm,
  assistantHighRiskSummary,
  shouldRunAssistantSystemCommand,
} from "../systemCommands/assistantExecutionGate";
import { loadConnectedIntegrationIds } from "../utils/assistantIntegrationProviders";
import type { ParsedSystemCommandV1 } from "../systemCommands/catalog";
import { extractExositesAction } from "../systemCommands/parseExositesAction";
import { getActiveConversationId } from "../systemCommands/activeConversationRef";

function randomRequestId(): string {
  try {
    const arr = new Uint8Array(8);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return String(Date.now());
  }
}

interface AssistantReplyToolBridgeProps {
  settings: AppSettings;
}

/**
 * Listens for assistant completion events, parses ```exosites-action``` fences, and runs gated IPC.
 */
export default function AssistantReplyToolBridge({ settings }: AssistantReplyToolBridgeProps) {
  const { t } = useI18n();
  const [confirmCmd, setConfirmCmd] = useState<ParsedSystemCommandV1 | null>(null);
  const busyRef = useRef(false);

  const executeCommand = useCallback(
    async (cmd: ParsedSystemCommandV1) => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        // Inject conversation_id into save_memory so the backend can scope the
        // entry to this conversation while keeping global entries (conversation_id=null)
        // visible everywhere.
        const activeConvId = getActiveConversationId();
        const args =
          cmd.commandId === "save_memory" && activeConvId
            ? { ...cmd.args, conversation_id: activeConvId }
            : cmd.args;
        const res = await window.electronAPI!.systemCommandExecute!({
          commandId: cmd.commandId,
          args,
          requestId: randomRequestId(),
          context: { outputDir: settings.outputDir },
        });
        if (res.ok) {
          toast.success(t("settings.assistantToastDone"));
          auditSystemCommand({ commandId: cmd.commandId, outcome: "ran" });
          // Signal the chat panel to refresh its memoryBlock — save_memory writes
          // to SQLite but the React state is only fetched once on mount.
          if (cmd.commandId === "save_memory") {
            window.dispatchEvent(
              new CustomEvent(ASSISTANT_MEMORY_SAVED_EVENT, {
                detail: {
                  category: cmd.args.category,
                  key: cmd.args.key,
                  value: cmd.args.value,
                },
              })
            );
          }
          window.dispatchEvent(
            new CustomEvent(ASSISTANT_TOOL_FOLLOWUP_READY_EVENT, {
              detail: { commandId: cmd.commandId, ok: true as const, result: res.data ?? null },
            })
          );
        } else {
          toast.error(t("settings.assistantToastFailed"));
          auditSystemCommand({
            commandId: cmd.commandId,
            outcome: "error",
            detail: res.reason ?? "execute_failed",
          });
        }
      } catch (e) {
        toast.error(t("settings.assistantToastFailed"));
        auditSystemCommand({
          commandId: cmd.commandId,
          outcome: "error",
          detail: e instanceof Error ? e.message : String(e),
        });
      } finally {
        busyRef.current = false;
      }
    },
    [settings.outputDir, t]
  );

  const runValidatedCommand = useCallback(
    async (cmd: ParsedSystemCommandV1) => {
      if (typeof window.electronAPI?.systemCommandExecute !== "function") return;
      const connectedIds = await loadConnectedIntegrationIds();
      const gate = shouldRunAssistantSystemCommand(settings, cmd.commandId, connectedIds);
      if (!gate.ok) {
        if (gate.reason === "assistant_disabled") {
          window.dispatchEvent(
            new CustomEvent(ASSISTANT_PERMISSIONS_PROMPT_EVENT, { detail: { force: true } })
          );
          auditSystemCommand({
            commandId: cmd.commandId,
            outcome: "skipped",
            detail: gate.reason,
          });
          return;
        }
        const msg =
          gate.reason === "read_disabled"
            ? t("settings.assistantToastReadDisabled")
            : gate.reason === "write_disabled"
              ? t("settings.assistantToastWriteDisabled")
              : t("settings.assistantToastProviderDisabled");
        toast.message(msg);
        auditSystemCommand({
          commandId: cmd.commandId,
          outcome: "skipped",
          detail: gate.reason,
        });
        return;
      }

      if (assistantCommandNeedsHighRiskConfirm(cmd.commandId)) {
        setConfirmCmd(cmd);
        return;
      }

      await executeCommand(cmd);
    },
    [executeCommand, settings, t]
  );

  useEffect(() => {
    const onReply = (ev: Event) => {
      const ce = ev as CustomEvent<{ text?: string }>;
      const text = typeof ce.detail?.text === "string" ? ce.detail.text : "";
      if (!text.trim()) return;

      const extracted = extractExositesAction(text);
      if (!extracted.command || extracted.parseError) return;

      void runValidatedCommand(extracted.command);
    };

    window.addEventListener(ASSISTANT_REPLY_COMPLETE_EVENT, onReply as EventListener);
    return () => window.removeEventListener(ASSISTANT_REPLY_COMPLETE_EVENT, onReply as EventListener);
  }, [runValidatedCommand]);

  return confirmCmd ? (
    <ModalShell
      title={t("settings.assistantConfirmHighTitle")}
      onClose={() => setConfirmCmd(null)}
      footer={
        <div className={`${MODAL_FOOTER_ROW_CLASS} gap-2 justify-end`}>
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg text-sm border border-border text-muted hover:bg-hover-overlay"
            onClick={() => setConfirmCmd(null)}
          >
            {t("settings.assistantConfirmCancel")}
          </button>
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-button-primary text-white hover:bg-button-hover"
            onClick={() => {
              const c = confirmCmd;
              setConfirmCmd(null);
              if (c) void executeCommand(c);
            }}
          >
            {t("settings.assistantConfirmRun")}
          </button>
        </div>
      }
    >
      <p className="text-sm text-text-primary leading-relaxed">
        {t("settings.assistantConfirmHighDescription", {
          summary: assistantHighRiskSummary(confirmCmd.commandId),
        })}
      </p>
    </ModalShell>
  ) : null;
}
