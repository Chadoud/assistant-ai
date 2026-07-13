import { useState } from "react";
import DailyBriefing from "../DailyBriefing";
import PanelCard from "../ui/PanelCard";
import { useI18n } from "../../i18n/I18nContext";

interface Props {
  backendOnline: boolean;
  proAllowed?: boolean;
  onUpgrade?: () => void;
  hideProCard?: boolean;
}

export default function TodayBriefingCard({
  backendOnline,
  proAllowed,
  onUpgrade,
  hideProCard,
}: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <PanelCard padding="sm" className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-medium text-text-primary">{t("briefing.title")}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open ? (
        <DailyBriefing
          backendOnline={backendOnline}
          proAllowed={proAllowed}
          onUpgrade={onUpgrade}
          hideProCard={hideProCard}
          showNudges={false}
        />
      ) : null}
    </PanelCard>
  );
}
