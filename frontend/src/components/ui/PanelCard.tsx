import type { ReactNode } from "react";
import { CARD_SHELL_CLASS } from "../../utils/styles";

interface PanelCardProps {
  children: ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md";
}

const PADDING: Record<NonNullable<PanelCardProps["padding"]>, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
};

/** Single card surface for second-brain panel content. */
export default function PanelCard({ children, className = "", padding = "md" }: PanelCardProps) {
  return (
    <div className={`${CARD_SHELL_CLASS} ${PADDING[padding]} ${className}`.trim()}>{children}</div>
  );
}
