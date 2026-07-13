import { useCallback } from "react";
import { toast } from "sonner";
import type { GmailDeveloperSetupStep } from "../../api/gmail";
import { useI18n } from "../../i18n/I18nContext";

function statusBadgeClass(status: GmailDeveloperSetupStep["status"]): string {
  switch (status) {
    case "pass":
      return "bg-success-soft text-success border-success-line";
    case "fail":
      return "bg-error-soft text-error border-error-line";
    case "manual":
      return "bg-warning-soft text-warning border-warning-line";
    case "skipped":
      return "bg-bg-secondary text-muted border-border";
    case "not_applicable":
    default:
      return "bg-bg-secondary text-muted border-border";
  }
}

function stepLabelKey(id: string): `sources.${string}` {
  return `sources.gmailDevStep_${id}` as `sources.${string}`;
}

function statusLabelKey(status: GmailDeveloperSetupStep["status"]): `sources.${string}` {
  return `sources.gmailDevStatus_${status}` as `sources.${string}`;
}

function manualHintKey(id: string): `sources.${string}` {
  return `sources.gmailDevManual_${id}` as `sources.${string}`;
}

interface GmailDeveloperSetupChecklistProps {
  steps: GmailDeveloperSetupStep[] | undefined;
}

/**
 * Read-only checklist for Gmail developer setup (driven by ``GET /gmail/status``).
 */
export default function GmailDeveloperSetupChecklist({ steps }: GmailDeveloperSetupChecklistProps) {
  const { t } = useI18n();

  const copyRedirectUri = useCallback(
    (uri: string) => {
      void navigator.clipboard.writeText(uri).then(
        () => toast.message(t("sources.gmailDevCopyUriSuccess")),
        () => toast.error(t("sources.gmailDevCopyUriFailed"))
      );
    },
    [t]
  );

  if (!steps?.length) return null;

  return (
    <div className="space-y-3 border-t border-border/80 pt-3">
      <p className="text-xs text-muted leading-relaxed">{t("sources.gmailDevChecklistIntro")}</p>
      <ul className="space-y-2.5 list-none p-0 m-0">
        {steps.map((step) => {
          const label = t(stepLabelKey(step.id));
          const statusLabel = t(statusLabelKey(step.status));
          const hints = step.hints ?? {};
          const redirectUri =
            typeof hints.redirect_uri_effective === "string" ? hints.redirect_uri_effective : "";

          return (
            <li
              key={step.id}
              className="rounded-lg border border-border/80 bg-bg-card/40 px-3 py-2.5 flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-xs font-medium text-text-primary leading-snug">{label}</p>
                {step.status === "manual" ? (
                  <p className="text-2xs text-muted leading-relaxed">{t(manualHintKey(step.id))}</p>
                ) : null}
                {step.status === "fail" && step.id === "client_credentials" ? (
                  <p className="text-2xs text-error/90 leading-relaxed">{t("sources.gmailDevFailClientCredentials")}</p>
                ) : null}
                {step.status === "fail" && step.id === "json_client_file" ? (
                  <p className="text-2xs text-error/90 leading-relaxed">{t("sources.gmailDevFailJsonClient")}</p>
                ) : null}
                {step.status === "fail" && step.id === "redirect_uri" ? (
                  <p className="text-2xs text-error/90 leading-relaxed">{t("sources.gmailDevFailRedirectUri")}</p>
                ) : null}
                {step.status === "fail" && step.id === "gmail_api_enabled" ? (
                  <p className="text-2xs text-error/90 leading-relaxed">{t("sources.gmailDevFailGmailApi")}</p>
                ) : null}
                {step.id === "redirect_uri" && redirectUri && step.status === "pass" ? (
                  <p className="text-2xs text-muted font-mono break-all">{redirectUri}</p>
                ) : null}
                {step.id === "redirect_uri" && redirectUri && step.status === "manual" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="text-2xs font-mono text-muted break-all bg-bg-secondary/80 px-1.5 py-0.5 rounded">
                      {redirectUri}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyRedirectUri(redirectUri)}
                      className="text-2xs font-medium text-accent hover:underline shrink-0"
                    >
                      {t("sources.gmailDevCopyUri")}
                    </button>
                  </div>
                ) : null}
              </div>
              <span
                className={`shrink-0 text-2xs font-semibold px-2 py-0.5 rounded border ${statusBadgeClass(step.status)}`}
              >
                {statusLabel}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
