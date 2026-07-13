"""Runtime guard for unfulfilled assistant promises (TurnService)."""

from __future__ import annotations

import re

# Forward-looking / in-progress action commitments across EN/FR/DE/IT. These say
# "I am about to / I am now doing X" — the exact shape of an unfulfilled promise
# when no tool call backs them up.
_COMMITMENT_PATTERNS: tuple[str, ...] = (
    # English
    r"\bi'?ll\b",
    r"\bi will\b",
    r"\bi'?m going to\b",
    r"\bi am going to\b",
    r"\bi'?m gonna\b",
    r"\blet me (?:check|look|see|find|open|search|navigate|get|grab|pull up|take a look|"
    r"move|do|work|handle|take care|sort|fix|set up|unsubscribe|block|filter)\b",
    r"\blet me work through\b",
    r"\bon it\b",
    r"\bi'?m on it\b",
    r"\bworking on (?:that|it)\b",
    r"\brunning in the background\b",
    r"\bi'?ll go ahead\b",
    r"\bhang on while i\b",
    r"\bhold on while i\b",
    r"\bgive me a (?:sec|second|moment)\b",
    # French
    r"\bje vais\b",
    r"\bje m'en occupe\b",
    r"\bje m'en charge\b",
    r"\bje m'occupe\b",
    r"\blaisse[-\s]?moi\b",
    r"\blaissez[-\s]?moi\b",
    r"\bje (?:vérifie|verifie|regarde|cherche|consulte|ouvre)\b",
    r"\bje te fais (?:ça|ca)\b",
    # German
    r"\bich werde\b",
    r"\blass mich\b",
    r"\bich (?:schaue|prüfe|pruefe|überprüfe|ueberpruefe|öffne|oeffne|suche)\b",
    r"\bich kümmere mich\b",
    r"\beinen moment\b",
    # Italian
    r"\bvado a\b",
    r"\bsto per\b",
    r"\bfammi\b",
    r"\bme ne occupo\b",
    r"\bci penso io\b",
    r"\b(?:controllo|verifico|cerco|apro|guardo) (?:subito|adesso|ora)\b",
)

# Explicit admissions of inability — if present, honesty is already satisfied and
# no nudge is warranted (the model told the user it can't, which is the goal).
_INABILITY_PATTERNS: tuple[str, ...] = (
    r"\bi can'?t\b",
    r"\bi cannot\b",
    r"\bi'?m not able\b",
    r"\bi am not able\b",
    r"\bi'?m unable\b",
    r"\bi am unable\b",
    r"\bje ne peux pas\b",
    r"\bje n'?ai pas (?:la possibilité|la possibilite|accès|acces|moyen)\b",
    r"\bje ne suis pas en mesure\b",
    r"\bich kann (?:das )?nicht\b",
    r"\bich bin nicht in der lage\b",
    r"\bnon posso\b",
    r"\bnon sono in grado\b",
)

_COMMITMENT_RE = re.compile("|".join(_COMMITMENT_PATTERNS), re.IGNORECASE)
_INABILITY_RE = re.compile("|".join(_INABILITY_PATTERNS), re.IGNORECASE)

# Past-tense claims that an action already happened — same failure mode as a future
# promise when no tool ran (e.g. "Je l'ai ajouté à votre calendrier" with no API call).
_FALSE_COMPLETION_PATTERNS: tuple[str, ...] = (
    r"\bje l'?ai ajouté\b",
    r"\bj'?ai (?:créé|cree|ajouté|ajoute|mis|programmé|programme)\b",
    r"\bc'?est (?:fait|créé|cree|ajouté|ajoute|enregistré|enregistre)\b",
    r"\bc'?est dans (?:ton|votre) calendrier\b",
    r"\bi(?:'ve| have) (?:added|created|scheduled|set)\b",
    r"\bi added (?:it|that|the)\b",
    r"\bit'?s (?:done|scheduled|on your calendar|been added)\b",
    r"\bich habe (?:es )?(?:hinzugefügt|erstellt|eingetragen)\b",
    r"\bho (?:aggiunto|creato|inserito)\b",
    r"\bi(?:'ve| have) (?:moved|blocked|filtered|unsubscribed)\b",
    r"\bfilter is (?:set|created|active)\b",
    r"\bi moved (?:those|the|all|them)\b",
    r"\bthose emails (?:are|have been) (?:moved|blocked|filtered)\b",
)

_FALSE_COMPLETION_RE = re.compile("|".join(_FALSE_COMPLETION_PATTERNS), re.IGNORECASE)

# Minimum length before we even consider a turn — single-word acks ("Okay")
# are never promises.
_MIN_CHARS = 8

# The corrective turn injected when an unfulfilled promise is detected. Phrased as
# a system instruction so the model acts on it without reading it aloud verbatim.
PROMISE_NUDGE = (
    "[SYSTEM CHECK] You just told the user you would do something, but you did not "
    "call any tool this turn. Either call the correct tool NOW to actually do it, or "
    "tell the user plainly in one short sentence that you cannot do it and exactly "
    "why. Do not repeat the promise without acting on it."
)

TOOL_FAILED_NUDGE = (
    "[SYSTEM CHECK] Your tool call failed but you told the user the action succeeded. "
    "Either retry the correct tool NOW with complete arguments (summary, start, end), "
    "or tell the user plainly in one short sentence that it did not work and why. "
    "Do not claim the calendar event was created unless the tool returned ok."
)


def looks_like_unfulfilled_promise(text: str) -> bool:
    """True if ``text`` commits to an action without admitting it can't be done.

    Intended to gate a corrective nudge ONLY when the turn also performed no tool
    call. Conservative by design: returns False on inability admissions and on text
    too short to carry a real commitment.

    :param text: the assistant's spoken output for the turn.
    """
    stripped = (text or "").strip()
    if len(stripped) < _MIN_CHARS:
        return False
    if _INABILITY_RE.search(stripped):
        return False
    if _FALSE_COMPLETION_RE.search(stripped):
        return True
    return bool(_COMMITMENT_RE.search(stripped))
