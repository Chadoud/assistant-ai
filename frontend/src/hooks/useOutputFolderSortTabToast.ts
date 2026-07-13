import { useEffect } from "react";
import { toast } from "sonner";
import { OUTPUT_FOLDER_SORT_TAB_TOAST_SHOWN_KEY } from "../constants";
import type { MainNavTab } from "./useMainNavItems";
import type { UiLocale } from "../i18n/locale";
import { translate } from "../i18n/translate";
import {
  QUEUE_SETTINGS_SECTIONS,
} from "../utils/queueSettingsNavigation";
import { takePendingOutputFolderSortTabToast } from "../utils/outputFolderToast";

/**
 * Shows the default output-folder toast on the first Sort-tab visit after sign-in,
 * not during the account gate when settings are auto-seeded.
 */
export function useOutputFolderSortTabToast(opts: {
  hydrated: boolean;
  mainAppReady: boolean;
  tab: MainNavTab;
  outputDir: string;
  uiLocale: UiLocale;
  jumpToSettingsSection: (sectionId: string) => void;
}) {
  const { hydrated, mainAppReady, tab, outputDir, uiLocale, jumpToSettingsSection } = opts;

  useEffect(() => {
    if (!hydrated || !mainAppReady || tab !== "queue") return;

    try {
      if (localStorage.getItem(OUTPUT_FOLDER_SORT_TAB_TOAST_SHOWN_KEY) === "1") {
        takePendingOutputFolderSortTabToast();
        return;
      }
    } catch {
      return;
    }

    const path = takePendingOutputFolderSortTabToast();
    if (!path) return;

    try {
      localStorage.setItem(OUTPUT_FOLDER_SORT_TAB_TOAST_SHOWN_KEY, "1");
    } catch {
      /* show once this session even if storage is blocked */
    }

    toast.success(translate(uiLocale, "app.outputFolderReadyToast", { path }), {
      id: "output-folder-ready",
      duration: 14_000,
      action: {
        label: translate(uiLocale, "outputBanner.changeInSettings"),
        onClick: () => jumpToSettingsSection(QUEUE_SETTINGS_SECTIONS.outputFolder),
      },
    });
  }, [hydrated, mainAppReady, tab, outputDir, uiLocale, jumpToSettingsSection]);
}
