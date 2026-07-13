/**
 * Short labels for review reasons (donut, table, cards).
 * Full text stays on `title` / tooltips / exports where needed.
 */

type TFn = (key: string, vars?: Record<string, string | number>) => string;

const NO_REASON = "(no reason)";

/** Gate / system reasons from job_service (and similar). */
const SYSTEM_PREFIX_SHORT: readonly [pattern: RegExp, label: string][] = [
  [/low\s+ocr\s+signal/i, "Low OCR signal"],
  [/low\s+extraction\s+quality/i, "Low extraction quality"],
  [/ambiguous\s+folder\s+match/i, "Ambiguous folder match"],
  [/new\s+folder\s+blocked/i, "New folder blocked"],
  [/low\s+confidence/i, "Low confidence"],
];

function extractQuotedSpan(s: string): string | null {
  const m =
    s.match(/["“”]([^"“”]+)["“”]/) ||
    s.match(/['‘’]([^'‘’]+)['‘’]/) ||
    s.match(/`([^`]+)`/);
  return m ? m[1].trim() : null;
}

/** Mentions / contains / references … with a quoted or highlighted span. */
function shortenMentionStyle(s: string): string | null {
  const low = s.toLowerCase();
  const quoted = extractQuotedSpan(s);

  if (/\bmentions?\b/.test(low) && quoted) {
    return `Mentions "${quoted}"`;
  }
  if (/\b(?:contains?|includes?)\b/.test(low) && quoted) {
    return `Contains "${quoted}"`;
  }
  if (/\b(?:references?|refers?\s+to|cites?)\b/.test(low) && quoted) {
    return `References "${quoted}"`;
  }
  return null;
}

function shortenSortingRule(s: string): string | null {
  const skip = s.match(/sorting\s+rule:\s*skip\s*\(manual\s*review\)\s*\(([^)]+)\)/i);
  if (skip) return `Rule skip (${skip[1]})`;
  const to = s.match(/sorting\s+rule\s*→\s*(.+?)\s*\(([^)]+)\)\s*$/i);
  if (to) return `Rule → ${to[1].trim()}`;
  return null;
}

function clipLeadingFluff(s: string): string {
  return s
    .replace(/^(?:the\s+)?file\s+(?:content\s+)?(?:explicitly|clearly|prominently|strongly)\s+/i, "")
    .replace(/^(?:the\s+)?file\s+/i, "")
    .replace(/^this\s+(?:document|file)\s+/i, "")
    .trim();
}

function fallbackShort(s: string): string {
  const one = clipLeadingFluff(s.split(/[.;]\s+/)[0] || s).trim();
  const words = one.split(/\s+/).filter(Boolean);
  const max = 4;
  if (words.length <= max) return one;
  return `${words.slice(0, max).join(" ")}…`;
}

/**
 * Compact reason for UI lists and histogram buckets (verb + subject, ~2–4 words).
 */
export function shortReviewReasonLabel(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return NO_REASON;

  for (const [re, label] of SYSTEM_PREFIX_SHORT) {
    if (re.test(s)) return label;
  }

  const rule = shortenSortingRule(s);
  if (rule) return rule;

  const mention = shortenMentionStyle(s);
  if (mention) return mention;

  return fallbackShort(s);
}

/**
 * Same as {@link shortReviewReasonLabel} but uses UI locale strings.
 */
export function shortReviewReasonLabelI18n(
  raw: string | null | undefined,
  t: TFn
): string {
  const s = (raw ?? "").trim();
  if (!s) return t("queue.reviewReasonNone");

  const system: [RegExp, string][] = [
    [/low\s+ocr\s+signal/i, "queue.reviewReasonLowOcr"],
    [/low\s+extraction\s+quality/i, "queue.reviewReasonLowExtraction"],
    [/ambiguous\s+folder\s+match/i, "queue.reviewReasonAmbiguous"],
    [/new\s+folder\s+blocked/i, "queue.reviewReasonNewFolderBlocked"],
    [/low\s+confidence/i, "queue.reviewReasonLowConfidence"],
  ];
  for (const [re, key] of system) {
    if (re.test(s)) return t(key);
  }

  const skip = s.match(/sorting\s+rule:\s*skip\s*\(manual\s+review\)\s*\(([^)]+)\)/i);
  if (skip) return t("queue.reviewReasonRuleSkip", { id: skip[1] });
  const to = s.match(/sorting\s+rule\s*→\s*(.+?)\s*\(([^)]+)\)\s*$/i);
  if (to) return t("queue.reviewReasonRuleTarget", { folder: to[1].trim(), id: to[2] });

  const low = s.toLowerCase();
  const quoted = extractQuotedSpan(s);
  if (/\bmentions?\b/.test(low) && quoted) {
    return t("queue.reviewReasonMentions", { phrase: quoted });
  }
  if (/\b(?:contains?|includes?)\b/.test(low) && quoted) {
    return t("queue.reviewReasonContains", { phrase: quoted });
  }
  if (/\b(?:references?|refers?\s+to|cites?)\b/.test(low) && quoted) {
    return t("queue.reviewReasonReferences", { phrase: quoted });
  }

  return fallbackShort(s);
}
