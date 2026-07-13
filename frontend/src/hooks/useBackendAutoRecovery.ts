import { useEffect, useRef, useState } from "react";
import { hasEntitlementIpc } from "../utils/electronDesktop";

const MAX_AUTO_RESTART_ATTEMPTS = 5;
const FIRST_AUTO_RESTART_DELAY_MS = 400;
const AUTO_RESTART_COOLDOWN_MS = 3000;

/** Milliseconds the backend must be continuously offline before a transient restart fires. */
const TRANSIENT_OFFLINE_THRESHOLD_MS = 8000;

type RetryBackendFn = (opts?: { silent?: boolean }) => void | Promise<void>;

/**
 * Automatically restarts the packaged backend when startup fails — no manual "Restart service" click.
 * Also silently recovers when the backend drops offline after having been online (transient crash).
 */
export function useBackendAutoRecovery(
  backendStartupFailed: boolean,
  backendOnline: boolean,
  retryBackend: RetryBackendFn | undefined,
  retryBusy: boolean,
): { autoRecoveryExhausted: boolean } {
  const attemptsRef = useRef(0);
  const [autoRecoveryExhausted, setAutoRecoveryExhausted] = useState(false);
  const wasOnlineRef = useRef(false);
  const transientOfflineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep a stable ref to retryBackend so setTimeout callbacks always call the latest version.
  const retryBackendRef = useRef(retryBackend);
  useEffect(() => { retryBackendRef.current = retryBackend; }, [retryBackend]);

  useEffect(() => {
    if (backendOnline) {
      wasOnlineRef.current = true;
      attemptsRef.current = 0;
      setAutoRecoveryExhausted(false);
      if (transientOfflineTimerRef.current !== null) {
        clearTimeout(transientOfflineTimerRef.current);
        transientOfflineTimerRef.current = null;
      }
    }
  }, [backendOnline]);

  // Startup-failure auto-recovery (existing behaviour).
  useEffect(() => {
    if (!hasEntitlementIpc()) return;
    if (!backendStartupFailed || retryBusy || !retryBackend) return;
    if (attemptsRef.current >= MAX_AUTO_RESTART_ATTEMPTS) {
      setAutoRecoveryExhausted(true);
      return;
    }

    const delay =
      attemptsRef.current === 0 ? FIRST_AUTO_RESTART_DELAY_MS : AUTO_RESTART_COOLDOWN_MS;
    const timerId = window.setTimeout(() => {
      attemptsRef.current += 1;
      void retryBackendRef.current?.({ silent: true });
    }, delay);

    return () => window.clearTimeout(timerId);
  }, [backendStartupFailed, retryBackend, retryBusy]);

  // Transient-drop recovery: backend was previously online, now offline → restart after threshold.
  useEffect(() => {
    if (!hasEntitlementIpc()) return;
    // Only activate when backend was previously healthy; startup failures are handled above.
    if (!wasOnlineRef.current || backendOnline || backendStartupFailed) return;
    if (retryBusy || !retryBackend) return;
    if (attemptsRef.current >= MAX_AUTO_RESTART_ATTEMPTS) return;

    // One timer at a time — cleared by cleanup or by backendOnline becoming true.
    if (transientOfflineTimerRef.current !== null) return;

    transientOfflineTimerRef.current = setTimeout(() => {
      transientOfflineTimerRef.current = null;
      // Guard: backend may have recovered before the threshold elapsed.
      if (wasOnlineRef.current && !backendOnline) {
        attemptsRef.current += 1;
        void retryBackendRef.current?.({ silent: true });
      }
    }, TRANSIENT_OFFLINE_THRESHOLD_MS);

    return () => {
      if (transientOfflineTimerRef.current !== null) {
        clearTimeout(transientOfflineTimerRef.current);
        transientOfflineTimerRef.current = null;
      }
    };
  }, [backendOnline, backendStartupFailed, retryBackend, retryBusy]);

  return { autoRecoveryExhausted };
}
