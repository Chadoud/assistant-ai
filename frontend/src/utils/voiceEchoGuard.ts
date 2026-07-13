/**
 * @deprecated Server is authoritative — use `serverTurn` from turn_complete frames.
 * Client echo guard applies only when `serverTurn` is absent (legacy/offline).
 * Mirrors backend/services/turn/echo.py.
 */

const MIN_ECHO_FRAGMENT_CHARS = 10;
const MIN_ECHO_WORD_OVERLAP = 0.72;
const MIN_ECHO_WORD_COUNT = 3;

const ECHO_STOPWORDS = new Set([
  "pour",
  "demain",
  "que",
  "qu",
  "j",
  "je",
  "a",
  "du",
  "de",
  "le",
  "la",
  "les",
  "un",
  "une",
  "des",
  "et",
  "en",
  "au",
  "aux",
  "the",
  "to",
  "an",
  "and",
  "or",
  "your",
  "my",
  "midi",
  "heure",
  "heures",
  "tomorrow",
  "today",
  "l",
  "ai",
  "vous",
  "ton",
  "votre",
]);

function normalizeEchoText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strict playback bleed: user text is a contiguous fragment of assistant TTS.
 */
function looksLikeAcousticEcho(userText: string, assistantText: string): boolean {
  const userNorm = normalizeEchoText(userText);
  const assistantNorm = normalizeEchoText(assistantText);
  if (!userNorm || !assistantNorm) return false;

  if (userNorm.length >= MIN_ECHO_FRAGMENT_CHARS && assistantNorm.includes(userNorm)) {
    return true;
  }
  if (assistantNorm.length >= MIN_ECHO_FRAGMENT_CHARS && userNorm.includes(assistantNorm)) {
    return true;
  }
  return false;
}

/**
 * True when `userText` is plausibly the mic picking up `assistantText`.
 */
export function looksLikeSpeakerEcho(userText: string, assistantText: string): boolean {
  const userNorm = normalizeEchoText(userText);
  const assistantNorm = normalizeEchoText(assistantText);
  if (!userNorm || !assistantNorm) return false;

  if (looksLikeAcousticEcho(userText, assistantText)) return true;

  const userWords = userNorm.split(" ");
  const assistantWords = assistantNorm.split(" ");
  if (hasOrderedWordRun(userWords, assistantWords)) return true;

  if (userWords.length < MIN_ECHO_WORD_COUNT) return false;

  const assistantWordSet = new Set(assistantWords);
  const overlap = userWords.filter((w) => assistantWordSet.has(w)).length / userWords.length;
  return overlap >= MIN_ECHO_WORD_OVERLAP;
}

function hasOrderedWordRun(userWords: string[], assistantWords: string[], minRun = 3): boolean {
  if (userWords.length < minRun || assistantWords.length === 0) return false;
  for (let start = 0; start <= userWords.length - minRun; start += 1) {
    const run = userWords.slice(start, start + minRun);
    if (run.filter((w) => !ECHO_STOPWORDS.has(w)).length < 2) {
      continue;
    }
    let cursor = 0;
    let matched = true;
    for (const word of run) {
      while (cursor < assistantWords.length && assistantWords[cursor] !== word) {
        cursor += 1;
      }
      if (cursor >= assistantWords.length) {
        matched = false;
        break;
      }
      cursor += 1;
    }
    if (matched) return true;
  }
  return false;
}

/**
 * Echo check for turn_complete — prior assistant lines only, substring bleed.
 */
export function looksLikeEchoOfPriorAssistant(
  userText: string,
  priorAssistantLines: readonly string[],
): boolean {
  return priorAssistantLines
    .filter((line) => line.trim())
    .some((assistant) => looksLikeAcousticEcho(userText, assistant));
}

/**
 * True if `userText` matches any recent assistant line (same turn or prior message).
 */
export function looksLikeEchoOfRecentAssistant(
  userText: string,
  sameTurnAssistant: string,
  priorAssistantLines: readonly string[],
): boolean {
  const candidates = [sameTurnAssistant, ...priorAssistantLines].filter((s) => s.trim());
  return candidates.some((assistant) => looksLikeSpeakerEcho(userText, assistant));
}
