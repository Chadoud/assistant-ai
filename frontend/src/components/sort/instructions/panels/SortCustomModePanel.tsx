import type { AppSettings } from "../../../../types/settings";
import { SortInstructionsPromptEditor } from "../../SortInstructionsPromptEditor";

interface SortCustomModePanelProps {
  settings: AppSettings;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
  backendOnline: boolean;
}

/** Inline custom instructions editor. */
export function SortCustomModePanel({ settings, onSettingsPatch, backendOnline }: SortCustomModePanelProps) {
  return (
    <SortInstructionsPromptEditor
      settings={settings}
      onSettingsPatch={onSettingsPatch}
      backendOnline={backendOnline}
      embedded
    />
  );
}
