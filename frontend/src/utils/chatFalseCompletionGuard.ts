/**
 * Detect assistant text that claims a calendar action completed without tool proof.
 * Mirrors backend voice_promise_guard false-completion patterns.
 */

const FALSE_CALENDAR_COMPLETION_PATTERNS: RegExp[] = [
  /je l['']?ai ajout[eé]/i,
  /j['']ai (?:cr[eé][eé]|ajout[eé])/i,
  /c['']est (?:fait|cr[eé][eé]|ajout[eé]|enregistr[eé])/i,
  /c['']est dans (?:ton|votre) calendrier/i,
  /i(?:'ve| have) (?:added|created|scheduled)/i,
  /i added (?:it|that|the)/i,
  /it'?s (?:done|scheduled|on your calendar|been added)/i,
];

function normalizeMatchText(text: string): string {
  return text.trim().replace(/[\u2018\u2019`´]/g, "'");
}

/**
 * True when assistant prose claims a calendar write succeeded.
 */
export function looksLikeFalseCalendarCompletion(text: string): boolean {
  const normalized = normalizeMatchText(text);
  if (normalized.length < 8) return false;
  return FALSE_CALENDAR_COMPLETION_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Replace unbacked calendar-success claims with an honest fallback message.
 */
export function sanitizeUnbackedCalendarClaim(
  text: string,
  toolWasCalled: boolean,
  fallbackMessage: string,
): string {
  if (toolWasCalled) return text;
  if (!looksLikeFalseCalendarCompletion(text)) return text;
  return fallbackMessage;
}
