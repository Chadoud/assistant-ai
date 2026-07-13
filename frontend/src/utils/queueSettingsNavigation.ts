import { openPrimarySettingsSection } from "./settingsNav";

/** Stable settings section ids used by Sort-tab CTAs. */
export const QUEUE_SETTINGS_SECTIONS = {
  outputFolder: "sorting-output",
  accountProfile: "account-profile",
  sortRules: "sorting-rules",
  sortModels: "settings-anchor-models",
} as const;

type QueueSettingsNavigation = {
  onOpenOutputSettings: () => void;
  onOpenAccountSettings: () => void;
  onOpenLicenseSettings: () => void;
  onOpenSortModelSettings: () => void;
};

/**
 * Maps Sort-tab settings CTAs to the correct Settings sub-tab + scroll target.
 */
export function createQueueSettingsNavigation(
  jumpToSettingsSection: (sectionId: string) => void
): QueueSettingsNavigation {
  return {
    onOpenOutputSettings: () => jumpToSettingsSection(QUEUE_SETTINGS_SECTIONS.outputFolder),
    onOpenAccountSettings: () => jumpToSettingsSection(QUEUE_SETTINGS_SECTIONS.accountProfile),
    onOpenLicenseSettings: () =>
      openPrimarySettingsSection(jumpToSettingsSection, { section: "license" }),
    onOpenSortModelSettings: () => jumpToSettingsSection(QUEUE_SETTINGS_SECTIONS.sortModels),
  };
}
