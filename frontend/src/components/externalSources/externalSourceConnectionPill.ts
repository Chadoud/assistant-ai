type ExternalSourceStatusTone = "ready" | "neutral";

/** Uniform Connected / Not connected copy for pills and card buttons. */
export function connectionStatusLabel(
  connected: boolean,
  loading: boolean,
  t: (key: string) => string,
): string {
  return !loading && connected
    ? t("sources.connectorStatusConnected")
    : t("sources.connectorStatusNotConnected");
}

/**
 * Uniform connection status copy for External sources cards.
 */
export function externalSourceConnectionPill(
  connected: boolean,
  loading: boolean,
  t: (key: string) => string,
): { statusLabel: string; statusTone: ExternalSourceStatusTone } {
  const isConnected = !loading && connected;
  return {
    statusLabel: connectionStatusLabel(connected, loading, t),
    statusTone: isConnected ? "ready" : "neutral",
  };
}
