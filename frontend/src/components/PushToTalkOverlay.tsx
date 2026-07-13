import {
  useEffect,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import type { UseVoiceSessionReturn } from "../hooks/useVoiceSession";
import { useI18n } from "../i18n/I18nContext";

/** Match AmbientVoiceHud handle strip (`h-7`). */
const VOICE_HUD_HANDLE_PX = 28;
/** Space between the PTT pill and the collapsed voice panel handle. */
const PTT_ABOVE_VOICE_HUD_GAP_PX = 16;
const PTT_DEFAULT_BOTTOM_INSET_PX = VOICE_HUD_HANDLE_PX + PTT_ABOVE_VOICE_HUD_GAP_PX;
/** AI Manager: sit a bit closer to the bottom edge (still clears the voice HUD handle). */
const PTT_EXO_BOTTOM_INSET_PX = 36;

interface PushToTalkOverlayProps {
  visible: boolean;
  shortcutLabel: string;
  locked: boolean;
  voice: UseVoiceSessionReturn;
  /** Main workspace column — pill is centered within this region, not the full window. On AI Manager, parent passes `.exo-center` instead. */
  anchorRef?: RefObject<HTMLElement | null>;
  /** When true, nudge the pill slightly lower (AI Manager tab only). */
  assistantLayout?: boolean;
}

/**
 * Small on-screen indicator while push-to-talk capture is active.
 */
export default function PushToTalkOverlay({
  visible,
  shortcutLabel,
  locked,
  voice,
  anchorRef,
  assistantLayout = false,
}: PushToTalkOverlayProps) {
  const { t } = useI18n();
  const [anchorCenterX, setAnchorCenterX] = useState<number | null>(null);

  useEffect(() => {
    const anchor = anchorRef?.current;
    if (!anchor || typeof window === "undefined") {
      setAnchorCenterX(null);
      return;
    }

    const updateAnchorCenter = () => {
      const rect = anchor.getBoundingClientRect();
      setAnchorCenterX(rect.left + rect.width / 2);
    };

    updateAnchorCenter();
    const observer = new ResizeObserver(updateAnchorCenter);
    observer.observe(anchor);
    window.addEventListener("resize", updateAnchorCenter);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateAnchorCenter);
    };
  }, [anchorRef, visible]);

  if (!visible) return null;

  const status = locked
    ? t("voice.pttOverlayLocked")
    : voice.isPttCapturing
      ? t("voice.pttOverlayListening")
      : t("voice.pttOverlayReady");

  const centerX = anchorCenterX ?? (typeof window !== "undefined" ? window.innerWidth / 2 : "50%");
  const bottomInsetPx = assistantLayout ? PTT_EXO_BOTTOM_INSET_PX : PTT_DEFAULT_BOTTOM_INSET_PX;

  const style: CSSProperties = {
    position: "fixed",
    left: centerX,
    bottom: `calc(${bottomInsetPx}px + env(safe-area-inset-bottom, 0px))`,
    transform: "translateX(-50%)",
    zIndex: 160,
    transition: "left 200ms ease",
  };

  return (
    <div
      style={style}
      className="pointer-events-none w-max max-w-[min(24rem,calc(100vw-3rem))] rounded-full border border-accent/40 bg-bg-primary/95 px-4 py-2 shadow-lg backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <p className="text-center text-sm font-medium text-text-primary">{status}</p>
      <p className="text-center text-2xs text-muted">
        {locked ? t("voice.pttOverlayLockedHint") : t("voice.pttOverlayHoldHint", { key: shortcutLabel })}
      </p>
    </div>
  );
}
