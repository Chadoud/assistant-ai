import { Component, type ReactNode, type ErrorInfo } from "react";
import { translateStored } from "../i18n/readStoredUiLocale";
import { copyTextToClipboard } from "../utils/clipboard";
import {
  isCrashReportingConfigured,
  isCrashReportsUserOptIn,
  isSentryCrashClientActive,
  reportHandledError,
} from "../telemetry/sentry";
import { submitManualCrashReport } from "../telemetry/crashBackendIngest";
import { APP_VERSION_LABEL } from "../constants";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /** Fires when a child throws (e.g. unblock welcome modal after WebGL/React failure). */
  onError?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string;
  reported: boolean;
  copied: boolean;
}

const IS_DEV = import.meta.env.DEV;

/**
 * Last-resort UI for uncaught render errors. React error boundaries stop the error
 * from reaching `window.onerror`, so this also forwards the crash to the reporting
 * pipeline (Sentry / crash DB) — otherwise render crashes would never be recorded.
 *
 * Uses persisted settings locale because this boundary wraps the i18n provider.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
    componentStack: "",
    reported: false,
    copied: false,
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error, reported: false, copied: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const stack = info.componentStack ?? "";
    this.setState({ componentStack: stack });
    console.error("[ErrorBoundary] Uncaught render error:", error, stack);
    try {
      if (!IS_DEV && isCrashReportsUserOptIn()) {
        if (isSentryCrashClientActive()) {
          reportHandledError(
            "react_error_boundary",
            error,
            stack ? `Component stack:${stack}` : undefined
          );
          this.setState({ reported: true });
        } else if (isCrashReportingConfigured()) {
          void this.confirmCrashDelivery(error, stack);
        }
      }
    } catch {
      /* reporting must never mask the original failure */
    }
    this.props.onError?.();
  }

  private async confirmCrashDelivery(error: Error, componentStack: string): Promise<void> {
    const stack = error.stack
      ? `${error.stack}\n\nComponent stack:${componentStack}`.trim()
      : componentStack
        ? `Component stack:${componentStack}`
        : null;
    const ok = await submitManualCrashReport({
      app_version: APP_VERSION_LABEL,
      environment: import.meta.env.MODE,
      platform: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 512) : null,
      source: "react_error_boundary",
      error_message: error.message || "unknown_error",
      stack_trace: stack,
    });
    if (ok) this.setState({ reported: true });
  }

  private handleCopyDetails = () => {
    const { error, componentStack } = this.state;
    const details = [error?.message, error?.stack, componentStack].filter(Boolean).join("\n\n");
    void copyTextToClipboard(details || translateStored("errors.unknownError")).then((ok) => {
      if (!ok) return;
      this.setState({ copied: true });
      window.setTimeout(() => this.setState({ copied: false }), 2000);
    });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    const t = translateStored;

    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-bg-primary p-6 text-text-primary">
        <div className="w-full max-w-md space-y-5 rounded-2xl border border-border bg-bg-secondary p-8 text-center shadow-xl">
          <div
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-error-faint text-3xl"
            aria-hidden
          >
            ⚠️
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold">{t("errors.unexpectedTitle")}</h1>
            {/* Raw exception text stays out of the UI — "Copy error details" carries it. */}
            <p className="break-words text-sm text-muted">{t("errors.boundaryBody")}</p>
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-button-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              {t("errors.boundaryReload")}
            </button>
            {!IS_DEV ? (
              <button
                onClick={this.handleCopyDetails}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-hover-overlay"
              >
                {this.state.copied ? t("errors.copied") : t("errors.copyDetails")}
              </button>
            ) : null}
          </div>

          {this.state.reported && !IS_DEV ? (
            <p className="text-xs text-muted">{t("errors.reported")}</p>
          ) : null}
        </div>
      </div>
    );
  }
}
