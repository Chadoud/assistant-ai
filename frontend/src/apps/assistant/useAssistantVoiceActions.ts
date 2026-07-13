import { useCallback, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { beginCodegenStudioUi } from "../../features/codegen/codegenStore";
import { VOICE_CODEGEN_START_EVENT } from "../../constants";
import {
  codegenCredentialsMessageKey,
  describeCodegenCredentialsIssue,
} from "../../features/codegen/codegenCredentialsPreflight";
import type { MainNavTab } from "../../hooks/useMainNavItems";
import type { UiLocale } from "../../i18n/locale";
import type { AppSettings } from "../../types/settings";
import { translate } from "../../i18n/translate";
import { requestOpenSettingsSection, getPrimarySettingsSectionDomId } from "../../utils/settingsNav";

type Tab = MainNavTab;

export function useAssistantVoiceActions(opts: {
  uiLocale: UiLocale;
  settings: AppSettings;
  setTab: Dispatch<SetStateAction<Tab>>;
  startPolling: (jobId: string) => void;
  setSessionId: Dispatch<SetStateAction<string | null>>;
}) {
  const { uiLocale, settings, setTab, startPolling, setSessionId } = opts;

  const onVoiceLocalSortJobStarted = useCallback(
    (jobId: string, sid: string) => {
      setSessionId(sid);
      startPolling(jobId);
      setTab("queue");
    },
    [setSessionId, startPolling, setTab],
  );

  const onVoiceCodegenRequested = useCallback(
    (goal: string) => {
      const trimmed = goal.trim();
      if (!trimmed) return;
      setTab("exo");
      if (!window.electronAPI?.codegenRunInstall) {
        toast.error(translate(uiLocale, "assistant.codegen.desktopRequired"));
        return;
      }
      const credentialsIssue = describeCodegenCredentialsIssue(settings);
      if (credentialsIssue) {
        toast.error(translate(uiLocale, codegenCredentialsMessageKey(credentialsIssue)), {
          description: translate(uiLocale, "assistant.codegen.openAiSettingsHint"),
          duration: 10_000,
          action: {
            label: translate(uiLocale, "assistant.codegen.openAiSettingsAction"),
            onClick: () =>
              requestOpenSettingsSection(getPrimarySettingsSectionDomId("aiAgents")),
          },
        });
        return;
      }
      beginCodegenStudioUi(trimmed);
      window.dispatchEvent(
        new CustomEvent(VOICE_CODEGEN_START_EVENT, { detail: { goal: trimmed } }),
      );
    },
    [settings, uiLocale, setTab],
  );

  return { onVoiceLocalSortJobStarted, onVoiceCodegenRequested };
}
