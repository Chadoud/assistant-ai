import { useEffect, useState } from "react";

/**
 * True when the browser tab or Electron window is not visible to the user.
 */
export function useDocumentPageHidden(): boolean {
  const [hidden, setHidden] = useState(() =>
    typeof document !== "undefined" ? document.hidden : false,
  );

  useEffect(() => {
    const sync = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  return hidden;
}
