import { useCallback, useRef } from "react";
import { POST_WELCOME_SPHERE_MODAL_DELAY_MS } from "../constants";
import TesseractVisual from "./TesseractVisual";

interface WelcomeSphereLayerProps {
  /** Fires after the animation has been visible for a beat — setup card can then mount. */
  onBackdropReady?: () => void;
}

/** Full-viewport background (pointer-events none) — hosts the Tesseract intro animation. */
export default function WelcomeSphereLayer({ onBackdropReady }: WelcomeSphereLayerProps) {
  const firedRef = useRef(false);
  const callbackRef = useRef(onBackdropReady);
  callbackRef.current = onBackdropReady;

  // TesseractVisual calls this after its first paint (pure CSS — always succeeds).
  // We wait the same dwell beat as the old sphere did before signalling the setup card.
  const handleReady = useCallback(() => {
    if (firedRef.current) return;
    window.setTimeout(() => {
      if (firedRef.current) return;
      firedRef.current = true;
      callbackRef.current?.();
    }, POST_WELCOME_SPHERE_MODAL_DELAY_MS);
  }, []);

  return (
    <div className="welcome-sphere-layer relative min-h-[100dvh] min-h-screen" aria-hidden>
      <div className="absolute inset-0 z-0 min-h-[100dvh] min-h-screen">
        <div className="welcome-sphere-reveal">
          <TesseractVisual onReady={handleReady} />
        </div>
      </div>
    </div>
  );
}
