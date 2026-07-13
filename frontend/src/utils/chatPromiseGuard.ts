/**
 * Text-chat guard for assistant promises without tool proof.
 * Mirrors backend/services/turn/promise.py patterns.
 */

const COMMITMENT_PATTERNS: RegExp[] = [
  /\bi'?ll\b/i,
  /\bi will\b/i,
  /\bi'?m going to\b/i,
  /\bi am going to\b/i,
  /\bi'?m gonna\b/i,
  /\blet me (?:check|look|see|find|open|search|navigate|get|grab|pull up|take a look|move|do|work|handle|take care|sort|fix|set up|unsubscribe|block|filter)\b/i,
  /\blet me work through\b/i,
  /\bon it\b/i,
  /\bi'?m on it\b/i,
  /\bworking on (?:that|it)\b/i,
  /\brunning in the background\b/i,
  /\bi'?ll go ahead\b/i,
  /\bhang on while i\b/i,
  /\bhold on while i\b/i,
  /\bgive me a (?:sec|second|moment)\b/i,
  /\bje vais\b/i,
  /\bje m'en occupe\b/i,
  /\bje m'en charge\b/i,
  /\blaisse[-\s]?moi\b/i,
  /\blaissez[-\s]?moi\b/i,
  /\bich werde\b/i,
  /\blass mich\b/i,
  /\bvado a\b/i,
  /\bsto per\b/i,
  /\bfammi\b/i,
  /\bme ne occupo\b/i,
];

const INABILITY_PATTERNS: RegExp[] = [
  /\bi can'?t\b/i,
  /\bi cannot\b/i,
  /\bi'?m not able\b/i,
  /\bi am not able\b/i,
  /\bi'?m unable\b/i,
  /\bi am unable\b/i,
  /\bje ne peux pas\b/i,
  /\bich kann (?:das )?nicht\b/i,
  /\bnon posso\b/i,
];

const FALSE_COMPLETION_PATTERNS: RegExp[] = [
  /je l['']?ai ajout[eé]/i,
  /j['']ai (?:cr[eé][eé]|ajout[eé]|mis|programm[eé])/i,
  /c['']est (?:fait|cr[eé][eé]|ajout[eé]|enregistr[eé])/i,
  /i(?:'ve| have) (?:added|created|scheduled|set|moved|blocked|filtered|unsubscribed)/i,
  /i added (?:it|that|the)/i,
  /it'?s (?:done|scheduled|on your calendar|been added)/i,
  /filter is (?:set|created|active)/i,
  /i moved (?:those|the|all|them)/i,
  /those emails (?:are|have been) (?:moved|blocked|filtered)/i,
];

const MIN_CHARS = 8;

function normalizeMatchText(text: string): string {
  return text.trim().replace(/[\u2018\u2019`´]/g, "'");
}

/** True when assistant text commits to an action without admitting inability. */
export function looksLikeUnfulfilledPromise(text: string): boolean {
  const normalized = normalizeMatchText(text);
  if (normalized.length < MIN_CHARS) return false;
  if (INABILITY_PATTERNS.some((p) => p.test(normalized))) return false;
  if (FALSE_COMPLETION_PATTERNS.some((p) => p.test(normalized))) return true;
  return COMMITMENT_PATTERNS.some((p) => p.test(normalized));
}

/** Replace unbacked promise or false-completion claims with an honest fallback. */
export function sanitizeUnbackedPromiseClaim(
  text: string,
  toolWasCalled: boolean,
  fallbackMessage: string,
): string {
  if (toolWasCalled) return text;
  if (!looksLikeUnfulfilledPromise(text)) return text;
  return fallbackMessage;
}
