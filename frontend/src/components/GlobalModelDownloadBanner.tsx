import ModelDownloadBanner from "./ModelDownloadBanner";
import type { UseModelsReturn } from "../hooks/useModels";
import type { MainNavTab } from "../hooks/useMainNavItems";

/** Settings and External sources show their own download UI; banner only when user switched away. */
export default function GlobalModelDownloadBanner({
  tab,
  modelHook,
}: {
  tab: MainNavTab;
  modelHook: UseModelsReturn;
}) {
  if (tab === "settings" || tab === "sources" || !modelHook.installingModel || !modelHook.installingModelName) {
    return null;
  }
  return (
    <ModelDownloadBanner
      installingModelName={modelHook.installingModelName}
      installProgress={modelHook.installProgress}
      installPhase={modelHook.installPhase}
      cancelInstall={modelHook.cancelInstall}
    />
  );
}
