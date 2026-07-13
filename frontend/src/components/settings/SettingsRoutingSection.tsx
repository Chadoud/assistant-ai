/**
 * SettingsRoutingSection — read-only view of how the connected AIs work as one system.
 *
 * For each capability (conversation, reasoning, vision, long inputs) it shows the
 * ordered relay chain and each provider's live state: ready (green), configured but
 * cooling down after errors (amber), or not configured (grey). It also lists the most
 * recent vision hand-offs, so automatic failover (e.g. "Gemini → Claude") is visible.
 *
 * Purely informational — it never changes configuration.
 */

import { useCallback, useEffect, useState } from "react";
import { desktopClient } from "../../desktopClient";

interface Props {
  backendOnline: boolean;
}

interface RoutingProvider {
  id: string;
  label: string;
  configured: boolean;
  healthy: boolean;
  supports_vision: boolean;
  is_local: boolean;
}

interface RoutingCapability {
  capability: string;
  label: string;
  providers: RoutingProvider[];
}

interface VisionRelay {
  ts: string;
  from: string;
  to: string;
  goal: string;
}

interface RoutingData {
  capabilities: RoutingCapability[];
  recent_vision_relays: VisionRelay[];
}

type ProviderState = "ready" | "cooling" | "missing";

function providerState(p: RoutingProvider): ProviderState {
  if (!p.configured) return "missing";
  return p.healthy ? "ready" : "cooling";
}

const DOT_CLASS: Record<ProviderState, string> = {
  ready: "bg-emerald-400",
  cooling: "bg-amber-400",
  missing: "bg-text-muted/40",
};

const STATE_TITLE: Record<ProviderState, string> = {
  ready: "Ready",
  cooling: "Configured — cooling down after recent errors",
  missing: "Not configured",
};

function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function SettingsRoutingSection({ backendOnline }: Props) {
  const [data, setData] = useState<RoutingData | null>(null);

  const load = useCallback(async () => {
    if (!backendOnline) return;
    try {
      const d = await desktopClient.getAiRouting();
      setData(d as unknown as RoutingData);
    } catch {
      setData(null);
    }
  }, [backendOnline]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!backendOnline) {
    return (
      <p className="text-xs text-muted">
        Connect to the backend to see how requests are routed across your AI providers.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2.5">
        {(data?.capabilities ?? []).map((cap) => {
          const leadIndex = cap.providers.findIndex((p) => providerState(p) === "ready");
          return (
            <div
              key={cap.capability}
              className="rounded-xl border border-border bg-bg-secondary p-3"
            >
              <div className="mb-2 text-xs font-semibold text-text-primary">{cap.label}</div>
              <div className="flex flex-wrap items-center gap-1.5">
                {cap.providers.map((p, idx) => {
                  const state = providerState(p);
                  const isLead = idx === leadIndex;
                  return (
                    <div key={p.id} className="flex items-center gap-1.5">
                      {idx > 0 && <span className="text-muted text-2xs select-none">→</span>}
                      <span
                        title={STATE_TITLE[state]}
                        className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs ${
                          isLead
                            ? "border-accent bg-accent-soft text-text-primary"
                            : "border-border bg-bg-primary text-text-secondary"
                        } ${state === "missing" ? "opacity-60" : ""}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[state]}`} />
                        {p.label}
                        {isLead && (
                          <span className="ml-0.5 font-semibold text-accent">· leads</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {data && data.recent_vision_relays.length > 0 && (
        <div className="rounded-xl border border-border bg-bg-secondary p-3">
          <div className="mb-2 text-xs font-semibold text-text-primary">Recent failovers (vision)</div>
          <ul className="space-y-1">
            {data.recent_vision_relays.map((relay, i) => (
              <li key={`${relay.ts}-${i}`} className="flex items-center gap-2 text-2xs text-text-secondary">
                <span className="capitalize">{relay.from || "?"}</span>
                <span className="text-muted">→</span>
                <span className="capitalize font-medium text-text-primary">{relay.to || "?"}</span>
                {relay.goal && <span className="text-muted truncate">· {relay.goal}</span>}
                <span className="ml-auto shrink-0 text-muted">{relativeTime(relay.ts)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
