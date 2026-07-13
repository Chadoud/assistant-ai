import { useCallback, useEffect, useState } from "react";

const DISMISS_KEY = "exo.installFromDmgHintDismissed";

/**
 * True when the desktop app is running from a mounted macOS disk image.
 */
export function useInstallFromDmgHint(): {
  showInstallHint: boolean;
  dismissInstallHint: () => void;
  openApplicationsFolder: () => Promise<void>;
} {
  const [showInstallHint, setShowInstallHint] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => typeof localStorage !== "undefined" && localStorage.getItem(DISMISS_KEY) === "1",
  );

  useEffect(() => {
    if (dismissed) return;
    const api = window.electronAPI?.getInstallLocation;
    if (!api) return;
    let cancelled = false;
    void api().then((state) => {
      if (!cancelled && state?.showInstallHint) {
        setShowInstallHint(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [dismissed]);

  const dismissInstallHint = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
    setShowInstallHint(false);
  }, []);

  const openApplicationsFolder = useCallback(async () => {
    const open = window.electronAPI?.openApplicationsFolder;
    if (open) await open();
  }, []);

  return {
    showInstallHint: showInstallHint && !dismissed,
    dismissInstallHint,
    openApplicationsFolder,
  };
}
