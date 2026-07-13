import { useEffect, useRef } from "react";
import { desktopClient } from "../desktopClient";
import { track, flushTelemetry, flushOfflineTelemetryQueue } from "../telemetry/client";
import {
  directCrashIngestConfigured,
  setBackendCrashIngestEnabled,
  setCrashReportUiLocale,
} from "../telemetry/crashBackendIngest";
import { TelemetryEventNames } from "../telemetry/schema";
import { setCodegenTelemetryContext } from "../features/codegen/codegenStore";
import { syncCrashReporting } from "../telemetry/sentry";
import {
  featureFromNavTab,
  setActiveFeature,
  setActiveTab,
} from "../telemetry/activeContext";
import { setProductTelemetryContext } from "../telemetry/productTelemetryContext";
import {
  trackFeatureEntered,
  trackFeatureExited,
} from "../telemetry/assistantTelemetry";
import type { MainNavTab } from "./useMainNavItems";

type AppTelemetryTab = MainNavTab;

interface UseAppTelemetryArgs {
  hydrated: boolean;
  telemetryOptIn: boolean;
  crashReportsOptIn: boolean;
  uiLocale: string;
  tab: AppTelemetryTab;
  backendOnline: boolean;
}

/**
 * Product telemetry + crash reporting sync — kept out of App.tsx to reduce file size.
 */
export function useAppTelemetry({
  hydrated,
  telemetryOptIn,
  crashReportsOptIn,
  uiLocale,
  tab,
  backendOnline,
}: UseAppTelemetryArgs): void {
  const telemetryAppStartedRef = useRef(false);
  const tabTelemetryPrevRef = useRef<AppTelemetryTab | null>(null);
  const featureEnteredAtRef = useRef<number | null>(null);
  const featurePrevRef = useRef<string | null>(null);
  const telemetrySettingsOpenedRef = useRef(false);

  useEffect(() => {
    setProductTelemetryContext(telemetryOptIn, uiLocale);
  }, [telemetryOptIn, uiLocale]);

  useEffect(() => {
    syncCrashReporting(crashReportsOptIn);
  }, [crashReportsOptIn]);

  useEffect(() => {
    // Direct public ingest (VITE_CRASH_INGEST_URL/TOKEN) doesn't need the local
    // backend — crashes POST straight to the central endpoint. Enable it whenever
    // configured; the user opt-in is still honoured by syncCrashReporting.
    if (directCrashIngestConfigured) {
      setBackendCrashIngestEnabled(true);
      setCrashReportUiLocale(uiLocale);
      syncCrashReporting(crashReportsOptIn);
      return;
    }
    if (!backendOnline) {
      setBackendCrashIngestEnabled(false);
      syncCrashReporting(crashReportsOptIn);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const body = await desktopClient.getClientConfig();
        if (cancelled) return;
        setBackendCrashIngestEnabled(Boolean((body as { crash_reports_ingest_enabled?: boolean }).crash_reports_ingest_enabled));
        setCrashReportUiLocale(uiLocale);
        syncCrashReporting(crashReportsOptIn);
      } catch {
        if (!cancelled) {
          setBackendCrashIngestEnabled(false);
          syncCrashReporting(crashReportsOptIn);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backendOnline, uiLocale, crashReportsOptIn]);

  useEffect(() => {
    if (!hydrated) return;
    if (!telemetryOptIn) return;
    if (telemetryAppStartedRef.current) return;
    telemetryAppStartedRef.current = true;
    track(telemetryOptIn, uiLocale, TelemetryEventNames.appStarted, {
      ui_locale: uiLocale,
    });
  }, [hydrated, telemetryOptIn, uiLocale]);

  useEffect(() => {
    if (!hydrated) return;
    setCodegenTelemetryContext(telemetryOptIn, uiLocale);
  }, [hydrated, telemetryOptIn, uiLocale]);

  useEffect(() => {
    if (!hydrated) return;
    const prev = tabTelemetryPrevRef.current;
    tabTelemetryPrevRef.current = tab;
    const feature = featureFromNavTab(tab);
    setActiveTab(tab);
    setActiveFeature(feature);

    if (prev === null) {
      featurePrevRef.current = feature;
      featureEnteredAtRef.current = Date.now();
      trackFeatureEntered(feature);
      return;
    }
    if (prev === tab) return;

    track(telemetryOptIn, uiLocale, TelemetryEventNames.tabChanged, {
      from_tab: prev,
      tab,
    });

    const prevFeature = featurePrevRef.current ?? featureFromNavTab(prev);
    if (prevFeature !== feature) {
      const enteredAt = featureEnteredAtRef.current ?? Date.now();
      trackFeatureExited(prevFeature, Math.max(0, (Date.now() - enteredAt) / 1000));
      trackFeatureEntered(feature);
      featurePrevRef.current = feature;
      featureEnteredAtRef.current = Date.now();
    }
  }, [hydrated, tab, telemetryOptIn, uiLocale]);

  useEffect(() => {
    if (!hydrated || tab !== "settings") return;
    if (telemetrySettingsOpenedRef.current) return;
    telemetrySettingsOpenedRef.current = true;
    track(telemetryOptIn, uiLocale, TelemetryEventNames.settingsOpened, {});
  }, [hydrated, tab, telemetryOptIn, uiLocale]);

  useEffect(() => {
    const onLeave = () => flushTelemetry(telemetryOptIn, uiLocale);
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [telemetryOptIn, uiLocale]);

  useEffect(() => {
    if (!telemetryOptIn) return;
    const onOnline = () => flushOfflineTelemetryQueue();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [telemetryOptIn]);

  useEffect(() => {
    if (!telemetryOptIn) return;
    if (!backendOnline) return;
    flushOfflineTelemetryQueue();
  }, [telemetryOptIn, backendOnline]);
}
