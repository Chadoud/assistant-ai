/**
 * Inline interactive card for composing an email.
 * Lets the user confirm/edit subject, recipient, and body hint,
 * then opens the pre-filled compose view in Gmail or Outlook.
 */

import { useMemo, useState } from "react";
import { buildMailComposeDeeplinks } from "../systemCommands/assistantIntent";
import { useI18n } from "../i18n/I18nContext";

interface AssistantMailComposeCardProps {
  subject: string;
  to: string;
  body: string;
  connectedProviderIds: string[] | null;
}

export default function AssistantMailComposeCard({
  subject: initialSubject,
  to: initialTo,
  body: initialBody,
  connectedProviderIds,
}: AssistantMailComposeCardProps) {
  const { t } = useI18n();
  const [subject, setSubject] = useState(initialSubject);
  const [to, setTo] = useState(initialTo);
  const [body, setBody] = useState(initialBody);

  const providerSet = useMemo(
    () => (connectedProviderIds ? new Set(connectedProviderIds) : null),
    [connectedProviderIds]
  );

  const links = useMemo(
    () => buildMailComposeDeeplinks(providerSet, subject, to, body),
    [providerSet, subject, to, body]
  );

  return (
    <div className="space-y-3 min-w-0">
      <div className="flex items-center gap-2 mb-1">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0 text-accent" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
        </svg>
        <span className="text-xs font-semibold text-text-primary">{t("assistant.mailComposeTitle")}</span>
      </div>

      {/* To */}
      <div className="space-y-1">
        <label className="text-2xs font-medium text-muted uppercase tracking-wide">{t("assistant.mailComposeTo")}</label>
        <input
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder={t("assistant.mailComposeToPlaceholder")}
          className="w-full rounded-lg border border-border bg-bg-primary px-2.5 py-1.5 text-sm text-text-primary placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {/* Subject */}
      <div className="space-y-1">
        <label className="text-2xs font-medium text-muted uppercase tracking-wide">{t("assistant.mailComposeSubject")}</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={t("assistant.mailComposeSubjectPlaceholder")}
          className="w-full rounded-lg border border-border bg-bg-primary px-2.5 py-1.5 text-sm text-text-primary placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {/* Body hint */}
      <div className="space-y-1">
        <label className="text-2xs font-medium text-muted uppercase tracking-wide">{t("assistant.mailComposeBody")}</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("assistant.mailComposeBodyPlaceholder")}
          rows={2}
          className="w-full resize-none rounded-lg border border-border bg-bg-primary px-2.5 py-1.5 text-sm text-text-primary placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {/* Provider buttons */}
      <div className="flex flex-col gap-2 pt-1">
        {links.map((link) => (
          <a
            key={link.provider}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl border border-border bg-bg-secondary px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-hover-overlay hover:border-accent"
          >
            <img src={link.logoSrc} alt="" width={16} height={16} className="h-4 w-4 shrink-0 object-contain" />
            <span className="flex-1">{t("assistant.mailComposeOpenIn", { provider: link.label })}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3 shrink-0 text-muted" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </a>
        ))}
        {links.length === 0 && (
          <p className="text-xs text-muted">{t("assistant.mailComposeNoProviders")}</p>
        )}
      </div>
    </div>
  );
}
