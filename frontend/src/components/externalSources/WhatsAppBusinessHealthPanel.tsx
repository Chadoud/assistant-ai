import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "../../i18n/I18nContext";
import { hasElectronBridge } from "../../utils/platform";

export type WhatsAppBusinessHealthSnapshot = {
  connected: boolean;
  displayPhoneNumber: string | null;
  webhookConfigured: boolean;
  cloudPollingEnabled: boolean;
  inboundCount: number;
  lastInboundMs: number | null;
  businessAccountId: string;
};

function formatRelativeTime(
  ms: number | null,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (!ms) return t("sources.whatsappHealthNoInboundYet");
  const deltaSec = Math.max(0, Math.floor(Date.now() / 1000 - ms / 1000));
  if (deltaSec < 60) return t("sources.whatsappHealthInboundJustNow");
  if (deltaSec < 3600) {
    return t("sources.whatsappHealthInboundMinutesAgo", { count: Math.floor(deltaSec / 60) });
  }
  if (deltaSec < 86400) {
    return t("sources.whatsappHealthInboundHoursAgo", { count: Math.floor(deltaSec / 3600) });
  }
  return t("sources.whatsappHealthInboundDaysAgo", { count: Math.floor(deltaSec / 86400) });
}

/**
 * Post-connect health: webhook sync, inbound activity, test send, approved templates.
 */
export default function WhatsAppBusinessHealthPanel() {
  const { t } = useI18n();
  const desktop = hasElectronBridge();
  const [health, setHealth] = useState<WhatsAppBusinessHealthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [testTo, setTestTo] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templates, setTemplates] = useState<
    Array<{ name: string; language?: string; status?: string; category?: string }>
  >([]);

  const refreshHealth = useCallback(async () => {
    if (!desktop || !window.electronAPI?.integrationGetWhatsAppBusinessStatus) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await window.electronAPI.integrationGetWhatsAppBusinessStatus();
      if (res?.ok && res.connected) {
        setHealth({
          connected: true,
          displayPhoneNumber:
            typeof res.displayPhoneNumber === "string" ? res.displayPhoneNumber : null,
          webhookConfigured: Boolean(res.webhookConfigured),
          cloudPollingEnabled: Boolean(res.cloudPollingEnabled),
          inboundCount: typeof res.inboundCount === "number" ? res.inboundCount : 0,
          lastInboundMs: typeof res.lastInboundMs === "number" ? res.lastInboundMs : null,
          businessAccountId: typeof res.businessAccountId === "string" ? res.businessAccountId : "",
        });
      } else {
        setHealth(null);
      }
    } finally {
      setLoading(false);
    }
  }, [desktop]);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  const sendTest = useCallback(async () => {
    if (!desktop || !window.electronAPI?.integrationSendWhatsAppTestMessage) return;
    const to = testTo.trim();
    if (!to) {
      toast.error(t("sources.whatsappHealthTestMissingNumber"));
      return;
    }
    setTestSending(true);
    try {
      const res = await window.electronAPI.integrationSendWhatsAppTestMessage({
        to,
        text: t("sources.whatsappHealthTestMessageBody"),
      });
      if (res?.ok) {
        toast.success(t("sources.whatsappHealthTestSent"));
        void refreshHealth();
      } else {
        toast.error(res?.reason || t("sources.whatsappHealthTestFailed"), { duration: 8000 });
      }
    } catch {
      toast.error(t("sources.whatsappHealthTestFailed"), { duration: 8000 });
    } finally {
      setTestSending(false);
    }
  }, [desktop, refreshHealth, t, testTo]);

  const loadTemplates = useCallback(async () => {
    if (!desktop || !window.electronAPI?.integrationListWhatsAppMessageTemplates) return;
    setTemplatesLoading(true);
    try {
      const res = await window.electronAPI.integrationListWhatsAppMessageTemplates({
        business_account_id: health?.businessAccountId,
        limit: 50,
      });
      if (res?.ok && Array.isArray(res.templates)) {
        setTemplates(res.templates.filter((row) => row.name));
      } else {
        setTemplates([]);
        toast.error(res?.reason || t("sources.whatsappHealthTemplatesFailed"), { duration: 8000 });
      }
    } catch {
      toast.error(t("sources.whatsappHealthTemplatesFailed"), { duration: 8000 });
    } finally {
      setTemplatesLoading(false);
    }
  }, [desktop, health?.businessAccountId, t]);

  const toggleTemplates = () => {
    setShowTemplates((open) => {
      const next = !open;
      if (next && templates.length === 0) void loadTemplates();
      return next;
    });
  };

  if (loading) {
    return <p className="text-xs text-muted">{t("sources.whatsappHealthLoading")}</p>;
  }

  if (!health?.connected) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-bg-secondary/60 px-3 py-3 text-xs">
      <div className="space-y-1">
        <p className="font-medium text-text-primary">
          {health.displayPhoneNumber
            ? t("sources.whatsappBusinessConnectedLine", { number: health.displayPhoneNumber })
            : t("sources.whatsappHealthConnectedGeneric")}
        </p>
        <p className="text-muted">
          {health.webhookConfigured && health.cloudPollingEnabled
            ? t("sources.whatsappWebhookActive")
            : t("sources.whatsappWebhookPending")}
        </p>
        <p className="text-muted">
          {health.inboundCount > 0
            ? t("sources.whatsappHealthInboundSummary", {
                count: health.inboundCount,
                when: formatRelativeTime(health.lastInboundMs, t),
              })
            : t("sources.whatsappHealthInboundWaiting")}
        </p>
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <p className="font-medium text-text-secondary">{t("sources.whatsappHealthTestTitle")}</p>
        <p className="text-muted leading-relaxed">{t("sources.whatsappHealthTestHint")}</p>
        <div className="flex flex-wrap gap-2">
          <input
            type="tel"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder={t("sources.whatsappHealthTestPlaceholder")}
            className="min-w-0 flex-1 rounded-lg border border-border bg-bg-card px-3 py-2 text-sm"
            autoComplete="tel"
          />
          <button
            type="button"
            disabled={testSending}
            onClick={() => void sendTest()}
            className="shrink-0 rounded-md border border-accent-line bg-accent-light px-3 py-2 text-xs font-medium text-accent hover:bg-accent/15 disabled:opacity-40"
          >
            {testSending ? t("sources.whatsappHealthTestSending") : t("sources.whatsappHealthTestSend")}
          </button>
        </div>
      </div>

      <div className="border-t border-border pt-2">
        <button
          type="button"
          onClick={toggleTemplates}
          className="text-xs font-medium text-muted hover:text-text-primary"
        >
          {showTemplates
            ? t("sources.whatsappHealthTemplatesHide")
            : t("sources.whatsappHealthTemplatesShow")}
        </button>
        {showTemplates ? (
          <div className="mt-2 space-y-1">
            {templatesLoading ? (
              <p className="text-muted">{t("sources.whatsappHealthTemplatesLoading")}</p>
            ) : templates.length === 0 ? (
              <p className="text-muted">{t("sources.whatsappHealthTemplatesEmpty")}</p>
            ) : (
              <ul className="max-h-32 space-y-1 overflow-y-auto">
                {templates.map((row) => (
                  <li key={`${row.name}-${row.language || ""}`} className="text-text-primary">
                    <span className="font-medium">{row.name}</span>
                    {row.language ? (
                      <span className="text-muted">{` · ${row.language}`}</span>
                    ) : null}
                    {row.status ? (
                      <span className="text-muted">{` · ${row.status}`}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-muted leading-relaxed pt-1">{t("sources.whatsappHealthSessionHint")}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
