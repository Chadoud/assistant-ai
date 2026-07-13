import type { ReactNode } from "react";
import { BADGE_BASE_CLASS } from "../../utils/styles";

type Tone = "success" | "warning" | "error" | "accent" | "info";

const TONE_CLASS: Record<Tone, string> = {
  success: "bg-success-soft text-success border-success-line",
  warning: "bg-warning-soft text-warning border-warning-line",
  error: "bg-error-soft text-error border-error-line",
  accent: "bg-accent-strong text-accent border-accent-line",
  info: "bg-info-soft text-info border-info-line",
};

/** Small uppercase pill (OCR status, speed tiers, etc.). */
export function StatusToneBadge({
  tone,
  children,
  className = "",
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
}) {
  return <span className={`${BADGE_BASE_CLASS} ${TONE_CLASS[tone]} ${className}`}>{children}</span>;
}

export function OcrStatusBadge({ status }: { status: "ready" | "partial" | "missing" }) {
  const tone: Tone = status === "ready" ? "success" : status === "partial" ? "warning" : "error";
  return <StatusToneBadge tone={tone}>{status}</StatusToneBadge>;
}

type LiveSize = "sm" | "md";

const LIVE_SIZE: Record<LiveSize, string> = {
  sm: "text-3xs gap-1 px-2 py-0.5 font-semibold",
  md: "text-xs gap-1.5 px-2 py-0.5 font-medium",
};

/**
 * Title bar / welcome step: API ready, checking, or offline (Retry lives on TitleBar when offline).
 */
export function LiveStatusPill({
  variant,
  size = "md",
  children,
}: {
  variant: "online" | "offline" | "checking";
  size?: LiveSize;
  children: ReactNode;
}) {
  const ring =
    variant === "online"
      ? "bg-success-soft text-success border-success-line"
      : variant === "checking"
        ? "bg-bg-secondary text-muted border-border"
        : "bg-error-soft text-error border-error-line";
  const dot =
    variant === "online"
      ? "bg-success motion-safe:animate-pulse"
      : variant === "checking"
        ? "bg-muted motion-safe:animate-pulse"
        : "bg-error";
  return (
    <span className={`inline-flex items-center rounded-full border shrink-0 ${ring} ${LIVE_SIZE[size]}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      {children}
    </span>
  );
}
