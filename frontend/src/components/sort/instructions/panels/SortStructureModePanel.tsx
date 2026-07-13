import type { AppSettings } from "../../../../types/settings";
import SortStructureBuilder from "../../structure/SortStructureBuilder";

interface SortStructureModePanelProps {
  settings: AppSettings;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
}

/** Inline folder structure editor with git-flow canvas. */
export function SortStructureModePanel({ settings, onSettingsPatch }: SortStructureModePanelProps) {
  return (
    <SortStructureBuilder settings={settings} onSettingsPatch={onSettingsPatch} embedded stripInline />
  );
}
