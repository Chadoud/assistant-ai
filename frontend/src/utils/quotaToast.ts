import { toast } from "sonner";
import { QUOTA_TOAST_DISMISSED_KEY } from "../constants";

/** Markers that mean a *free-tier* request cap was hit (not a paid transient 429). */
const FREE_TIER_MARKERS = [
  "free_tier",
  "free tier",
  "generaterequestsperday",
  "generate_content_free_tier_requests",
];

/** True when an error string indicates the provider's free-tier quota was exhausted. */
export function isFreeTierQuotaError(message: string | undefined | null): boolean {
  if (!message) return false;
  const low = message.toLowerCase();
  return FREE_TIER_MARKERS.some((marker) => low.includes(marker));
}

function isQuotaToastDismissed(): boolean {
  try {
    return localStorage.getItem(QUOTA_TOAST_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

interface ShowQuotaToastOptions {
  /** Opens Settings → AI Provider so the user can add a paid key. */
  onAddApiKey?: () => void;
}

/**
 * Surface a one-time, dismissible nudge to add a paid API key after a free-tier
 * cap was hit. Coalesces via a stable Sonner id and respects "Don't show again".
 */
export function showQuotaToast(options?: ShowQuotaToastOptions): void {
  if (isQuotaToastDismissed()) return;
  toast.warning("Free Gemini API limit reached", {
    id: "quota-hint",
    richColors: false,
    classNames: { toast: "app-sonner-toast-warning" },
    style: {
      background: "var(--bg-card)",
      border: "1px solid var(--warning)",
      color: "var(--text-primary)",
    },
    description:
      "You've hit the free Gemini API limit. Add a paid API key in Settings for faster, " +
      "reliable browsing and chat.",
    duration: 12_000,
    ...(options?.onAddApiKey
      ? { action: { label: "Add API key", onClick: options.onAddApiKey } }
      : {}),
    cancel: {
      label: "Don't show again",
      onClick: () => {
        try {
          localStorage.setItem(QUOTA_TOAST_DISMISSED_KEY, "1");
        } catch {
          /* storage unavailable — best effort */
        }
      },
    },
  });
}
