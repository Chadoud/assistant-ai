import { desktopClient } from "../desktopClient";
import type { AppSettings } from "../types/settings";
import { hasElectronBridge } from "./platform";
import { buildSortDesktopDefaultsPayload } from "./buildSortDesktopDefaultsPayload";

/**
 * Mirror Sort-tab settings to the backend so voice ``start_local_file_sort`` matches the UI pipeline.
 */
export async function syncSortDefaultsToBackend(
  settings: AppSettings,
  installedTesseractLangs: string[] | undefined
): Promise<void> {
  if (!hasElectronBridge()) return;
  const body = buildSortDesktopDefaultsPayload(settings, installedTesseractLangs);
  await desktopClient.postSortDesktopDefaults(body);
}
