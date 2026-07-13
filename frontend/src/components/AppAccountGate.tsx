import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
import { APP_DISPLAY_NAME, APP_LOGO_URL } from "../constants";
import { useI18n } from "../i18n/I18nContext";
import CloudAuthScreen from "./CloudAuthScreen";
import { Spinner } from "./Spinner";
import WindowChromeButtons from "./WindowChromeButtons";
import { isMacElectronClient } from "../utils/platform";

interface AppAccountGateProps {
  /** True while entitlement / session is still loading from the main process. */
  loading: boolean;
  onSignedIn: () => void;
}

/**
 * Full-screen first-run gate: account check, then sign-in / sign-up before any other UI mounts.
 * Rendered via portal so nothing underneath can flash or steal focus.
 */
export default function AppAccountGate({ loading, onSignedIn }: AppAccountGateProps) {
  const { t } = useI18n();

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex flex-col bg-bg-primary overflow-y-auto"
      role="presentation"
      aria-busy={loading}
    >
      {!isMacElectronClient() ? (
        <header
          className="sticky top-0 z-[310] flex shrink-0 items-center justify-end px-3 py-2 select-none bg-bg-primary/95 backdrop-blur-sm"
          style={{ WebkitAppRegion: "drag" } as CSSProperties}
        >
          <WindowChromeButtons />
        </header>
      ) : null}
      <div className="flex flex-1 flex-col items-center justify-center min-h-0 px-4 pb-8">
        {loading ? (
          <div className="flex flex-col items-center gap-4 px-6 text-center">
            <img
              src={APP_LOGO_URL}
              alt=""
              width={64}
              height={64}
              className="h-16 w-16 object-contain pointer-events-none"
            />
            <div className="flex items-center gap-2 text-sm text-muted">
              <Spinner className="w-5 h-5" />
              <span>{t("cloudAuth.checkingAccount")}</span>
            </div>
            <p className="text-2xs text-muted max-w-xs">
              {t("cloudAuth.checkingAccountHint", { app: APP_DISPLAY_NAME })}
            </p>
          </div>
        ) : (
          <div className="flex w-full max-w-md flex-col items-center gap-6">
            <CloudAuthScreen onSignedIn={onSignedIn} />
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
