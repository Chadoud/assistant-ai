import type { AppSettings } from "../../types/settings";
import { VoiceInteractionSettingsForm } from "../voice/VoiceInteractionSettingsForm";

interface SettingsVoiceInteractionSectionProps {
  settings: AppSettings;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
}

/**
 * Voice interaction mode: live conversation vs push-to-talk shortcut.
 */
export default function SettingsVoiceInteractionSection({
  settings,
  onSettingsPatch,
}: SettingsVoiceInteractionSectionProps) {
  return (
    <VoiceInteractionSettingsForm
        settings={settings}
        onSettingsPatch={onSettingsPatch}
        variant="full"
        radioGroupId="settings-panel"
      />
  );
}
