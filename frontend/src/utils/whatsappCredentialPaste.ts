/** Parsed Meta WhatsApp Cloud API credentials from a pasted blob (JSON, curl, or dashboard text). */
export type ParsedWhatsAppCredentials = {
  phoneNumberId?: string;
  businessAccountId?: string;
  accessToken?: string;
};

const NUMERIC_ID = /\b(\d{10,20})\b/g;
const FIRST_NUMERIC_ID = /\b(\d{10,20})\b/;
const EAA_TOKEN = /\b(EAA[A-Za-z0-9]+)\b/;
const BEARER_TOKEN = /Bearer\s+([A-Za-z0-9|._-]+)/i;
const GRAPH_PHONE_IN_URL = /graph\.facebook\.com\/v[\d.]+\/(\d{10,20})\/messages/i;

function pickString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function fromJsonObject(raw: Record<string, unknown>): ParsedWhatsAppCredentials {
  const phoneNumberId =
    pickString(raw.phone_number_id) ??
    pickString(raw.phoneNumberId) ??
    pickString(raw.phone_number_ID);
  const businessAccountId =
    pickString(raw.business_account_id) ??
    pickString(raw.businessAccountId) ??
    pickString(raw.waba_id) ??
    pickString(raw.wabaId);
  const accessToken =
    pickString(raw.access_token) ?? pickString(raw.accessToken) ?? pickString(raw.token);
  return { phoneNumberId, businessAccountId, accessToken };
}

/**
 * Extract Phone number ID, WABA ID, and access token from pasted Meta dashboard or curl text.
 */
export function parseWhatsAppCredentialPaste(text: string): ParsedWhatsAppCredentials {
  const trimmed = text.trim();
  if (!trimmed) return {};

  const result: ParsedWhatsAppCredentials = {};

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        Object.assign(result, fromJsonObject(parsed as Record<string, unknown>));
      }
    } catch {
      /* not JSON */
    }
  }

  const graphPhone = trimmed.match(GRAPH_PHONE_IN_URL);
  if (graphPhone?.[1]) result.phoneNumberId = result.phoneNumberId ?? graphPhone[1];

  const bearer = trimmed.match(BEARER_TOKEN);
  if (bearer?.[1]) result.accessToken = result.accessToken ?? bearer[1];

  const eaa = trimmed.match(EAA_TOKEN);
  if (eaa?.[1]) result.accessToken = result.accessToken ?? eaa[1];

  const lower = trimmed.toLowerCase();
  const idLabels: Array<{ label: string; field: keyof ParsedWhatsAppCredentials }> = [
    { label: "phone number id", field: "phoneNumberId" },
    { label: "id du numéro de téléphone", field: "phoneNumberId" },
    { label: "whatsapp business account", field: "businessAccountId" },
    { label: "id du compte whatsapp business", field: "businessAccountId" },
    { label: "waba", field: "businessAccountId" },
  ];
  for (const { label, field } of idLabels) {
    const idx = lower.indexOf(label);
    if (idx < 0) continue;
    const tail = trimmed.slice(idx + label.length);
    const match = FIRST_NUMERIC_ID.exec(tail);
    if (match?.[1] && !result[field]) result[field] = match[1];
  }

  if (!result.phoneNumberId || !result.businessAccountId) {
    const ids = [...trimmed.matchAll(NUMERIC_ID)].map((m) => m[1]);
    if (ids.length >= 2) {
      result.phoneNumberId = result.phoneNumberId ?? ids[0];
      result.businessAccountId = result.businessAccountId ?? ids[1];
    } else if (ids.length === 1 && !result.phoneNumberId) {
      result.phoneNumberId = ids[0];
    }
  }

  return result;
}
