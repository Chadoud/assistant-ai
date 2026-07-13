import { deriveIntentBucket } from "./intentBucket";
import { getActiveContext } from "./activeContext";
import { pushBreadcrumb } from "./breadcrumbs";
import { track } from "./client";
import {
  durationBucket,
  getProductTelemetryLocale,
  getProductTelemetryOptIn,
} from "./productTelemetryContext";
import { TelemetryEventNames, type TelemetryEventName } from "./schema";

function assistantIntentBucket(): string {
  const fromCrumbs = deriveIntentBucket();
  if (fromCrumbs !== "unknown") return fromCrumbs;
  const { active_feature: feature } = getActiveContext();
  if (feature === "assistant" || feature === "sort" || feature === "settings") {
    return feature;
  }
  return "unknown";
}

function withIntent(
  props: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  return { ...props, intent_bucket: assistantIntentBucket() };
}

export function trackProductEvent(
  name: TelemetryEventName,
  props: Record<string, string | number | boolean> = {},
): void {
  track(getProductTelemetryOptIn(), getProductTelemetryLocale(), name, props);
}

export function trackAssistantTurnStarted(channel: "text" | "voice"): void {
  pushBreadcrumb({ type: "api", action: "assistant_turn_started", meta: { channel } });
  trackProductEvent(TelemetryEventNames.assistantTurnStarted, withIntent({ channel }));
}

export function trackAssistantTurnCompleted(durationSec: number, toolCount: number): void {
  pushBreadcrumb({
    type: "api",
    action: "assistant_turn_completed",
    meta: { outcome: toolCount > 0 ? "with_tools" : "text_only" },
  });
  trackProductEvent(
    TelemetryEventNames.assistantTurnCompleted,
    withIntent({
      duration_bucket: durationBucket(durationSec),
      tool_count: toolCount,
      outcome: toolCount > 0 ? "with_tools" : "text_only",
    }),
  );
}

export function trackAssistantTurnFailed(errorClass: string, provider?: string): void {
  pushBreadcrumb({
    type: "api",
    action: "assistant_turn_failed",
    meta: { error_class: errorClass, ...(provider ? { provider } : {}) },
  });
  trackProductEvent(
    TelemetryEventNames.assistantTurnFailed,
    withIntent({
      error_class: errorClass,
      ...(provider ? { provider } : {}),
    }),
  );
}

export function trackAssistantToolInvoked(toolName: string): void {
  pushBreadcrumb({ type: "tool", action: "assistant_tool_invoked", meta: { tool_name: toolName } });
  trackProductEvent(TelemetryEventNames.assistantToolInvoked, { tool_name: toolName });
}

export function trackSendMessageStarted(platform: string): void {
  pushBreadcrumb({ type: "tool", action: "send_message_started", meta: { platform } });
  trackProductEvent(TelemetryEventNames.sendMessageStarted, { platform });
}

export function trackSendMessageCompleted(platform: string, method: string): void {
  pushBreadcrumb({
    type: "tool",
    action: "send_message_completed",
    meta: { platform, method, outcome: "ok" },
  });
  trackProductEvent(TelemetryEventNames.sendMessageCompleted, { platform, method });
}

export function trackSendMessageFailed(platform: string, errorClass: string): void {
  pushBreadcrumb({
    type: "tool",
    action: "send_message_failed",
    meta: { platform, error_class: errorClass },
  });
  trackProductEvent(TelemetryEventNames.sendMessageFailed, { platform, error_class: errorClass });
}

export function trackIntegrationConnectStarted(provider: string): void {
  pushBreadcrumb({ type: "ui", action: "integration_connect_started", meta: { provider } });
  trackProductEvent(TelemetryEventNames.integrationConnectStarted, { provider });
}

export function trackIntegrationConnectCompleted(provider: string, method: string): void {
  pushBreadcrumb({
    type: "ui",
    action: "integration_connect_completed",
    meta: { provider, method },
  });
  trackProductEvent(TelemetryEventNames.integrationConnectCompleted, { provider, method });
}

export function trackIntegrationConnectFailed(provider: string, errorClass: string): void {
  pushBreadcrumb({
    type: "ui",
    action: "integration_connect_failed",
    meta: { provider, error_class: errorClass },
  });
  trackProductEvent(TelemetryEventNames.integrationConnectFailed, { provider, error_class: errorClass });
}

export function trackProviderError(provider: string, errorClass: string, model?: string): void {
  pushBreadcrumb({
    type: "api",
    action: "provider_error",
    meta: { provider, error_class: errorClass, ...(model ? { method: model } : {}) },
  });
  trackProductEvent(TelemetryEventNames.providerError, {
    provider,
    error_class: errorClass,
    ...(model ? { model } : {}),
  });
}

export function trackFeatureEntered(feature: string): void {
  pushBreadcrumb({ type: "ui", action: "feature_entered", meta: { feature } });
  trackProductEvent(TelemetryEventNames.featureEntered, { feature });
}

export function trackFeatureExited(feature: string, durationSec: number): void {
  trackProductEvent(TelemetryEventNames.featureExited, {
    feature,
    duration_bucket: durationBucket(durationSec),
  });
}
