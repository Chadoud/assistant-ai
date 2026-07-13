/**
 * Inline interactive card for calendar event creation.
 *
 * The user can edit the AI-extracted title, date, time, and duration directly in the card,
 * then open the pre-filled compose view in Google Calendar or Outlook with one click.
 * No OAuth write scopes are required — all scheduling happens in the provider's own UI.
 */

import { useMemo, useState } from "react";
import { buildCalendarDeeplinks } from "../systemCommands/assistantIntent";
import { useI18n } from "../i18n/I18nContext";

interface AssistantEventCreateCardProps {
  title: string;
  startIso: string;
  connectedProviderIds: string[] | null;
}

const DURATION_OPTIONS: Array<{ labelKey: string; minutes: number }> = [
  { labelKey: "assistant.duration15m", minutes: 15 },
  { labelKey: "assistant.duration30m", minutes: 30 },
  { labelKey: "assistant.duration1h", minutes: 60 },
  { labelKey: "assistant.duration2h", minutes: 120 },
  { labelKey: "assistant.duration3h", minutes: 180 },
];

function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toTimeInputValue(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "09:00";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function buildStartIsoFromInputs(dateStr: string, timeStr: string): string {
  if (!dateStr || !timeStr) return new Date().toISOString();
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return new Date().toISOString();
  d.setHours(h ?? 9, m ?? 0, 0, 0);
  return d.toISOString();
}

export default function AssistantEventCreateCard({
  title: initialTitle,
  startIso: initialStartIso,
  connectedProviderIds,
}: AssistantEventCreateCardProps) {
  const { t } = useI18n();
  const [title, setTitle] = useState(initialTitle || "");
  const [dateStr, setDateStr] = useState(toDateInputValue(initialStartIso));
  const [timeStr, setTimeStr] = useState(toTimeInputValue(initialStartIso));
  const [durationMinutes, setDurationMinutes] = useState(60);

  const startIso = useMemo(() => buildStartIsoFromInputs(dateStr, timeStr), [dateStr, timeStr]);

  const endIso = useMemo(() => {
    const d = new Date(startIso);
    d.setMinutes(d.getMinutes() + durationMinutes);
    return d.toISOString();
  }, [startIso, durationMinutes]);

  const providerSet = useMemo(
    () => (connectedProviderIds ? new Set(connectedProviderIds) : null),
    [connectedProviderIds]
  );

  const links = useMemo(
    () => buildCalendarDeeplinks(providerSet, title, startIso),
    [providerSet, title, startIso]
  );

  // Build duration-aware links (override endIso from buildCalendarDeeplinks default 1h)
  const durationLinks = useMemo(() => {
    return links.map((link) => {
      const titleParam = encodeURIComponent(title || "New event");
      if (link.provider === "google") {
        const gcStart = startIso.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
        const gcEnd = endIso.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
        return {
          ...link,
          url: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${titleParam}&dates=${gcStart}/${gcEnd}`,
        };
      }
      return {
        ...link,
        url: `https://outlook.office.com/calendar/action/compose?subject=${titleParam}&startdt=${encodeURIComponent(startIso)}&enddt=${encodeURIComponent(endIso)}`,
      };
    });
  }, [links, title, startIso, endIso]);

  return (
    <div className="space-y-3 min-w-0">
      <div className="flex items-center gap-2 mb-1">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0 text-accent" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
        </svg>
        <span className="text-xs font-semibold text-text-primary">{t("assistant.eventCreateTitle")}</span>
      </div>

      {/* Title */}
      <div className="space-y-1">
        <label className="text-2xs font-medium text-muted uppercase tracking-wide">{t("assistant.eventTitle")}</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("assistant.eventTitlePlaceholder")}
          className="w-full rounded-lg border border-border bg-bg-primary px-2.5 py-1.5 text-sm text-text-primary placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {/* Date + Time */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-2xs font-medium text-muted uppercase tracking-wide">{t("assistant.eventDate")}</label>
          <input
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            className="w-full rounded-lg border border-border bg-bg-primary px-2.5 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div className="space-y-1">
          <label className="text-2xs font-medium text-muted uppercase tracking-wide">{t("assistant.eventTime")}</label>
          <input
            type="time"
            value={timeStr}
            onChange={(e) => setTimeStr(e.target.value)}
            className="w-full rounded-lg border border-border bg-bg-primary px-2.5 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      {/* Duration */}
      <div className="space-y-1">
        <label className="text-2xs font-medium text-muted uppercase tracking-wide">{t("assistant.eventDuration")}</label>
        <div className="flex flex-wrap gap-1.5">
          {DURATION_OPTIONS.map((opt) => (
            <button
              key={opt.minutes}
              type="button"
              onClick={() => setDurationMinutes(opt.minutes)}
              className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                durationMinutes === opt.minutes
                  ? "border-accent bg-button-primary text-white"
                  : "border-border bg-bg-secondary text-text-primary hover:bg-hover-overlay"
              }`}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Provider buttons */}
      <div className="flex flex-col gap-2 pt-1">
        {durationLinks.map((link) => (
          <a
            key={link.provider}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl border border-border bg-bg-secondary px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-hover-overlay hover:border-accent"
          >
            <img src={link.logoSrc} alt="" width={16} height={16} className="h-4 w-4 shrink-0 object-contain" />
            <span className="flex-1">{t("assistant.eventOpenIn", { provider: link.label })}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3 shrink-0 text-muted" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </a>
        ))}
        {durationLinks.length === 0 && (
          <p className="text-xs text-muted">{t("assistant.eventNoProviders")}</p>
        )}
      </div>
    </div>
  );
}
