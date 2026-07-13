"""System prompts and user-side text shaping for folder classification."""

from __future__ import annotations

from constants import DEFAULT_JOB_LANGUAGE, MAX_CONTEXT_FOLDERS
from destination_path import MAX_REL_DEST_SEGMENTS

MAX_SORT_USER_PROMPT_CHARS = 4000

USER_SORT_PROMPT_OVERLAY_PREFIX = (
    "\n\n[User sorting preferences — apply only when consistent with the rules above]\n"
)

SYSTEM_PROMPT = (
    "You are a file organization assistant. "
    "Your job is to put each file in the folder that best matches the DOCUMENT TYPE and purpose "
    "(e.g. bank or card statements, leases, insurance, unemployment or social insurance, employment/HR, "
    "taxes, invoices, identity, medical), not merely because a person's name appears in the text. "
    "For VIDEO or multi-frame content (excerpts may include [Visual] and [Spoken] sections), infer the real-world "
    "TOPIC: setting, activity, industry (e.g. dental lab and 3D scanning, school event, construction site). "
    "Never choose a generic catch-all whose only meaning is 'this is a video'—such as paths ending in "
    "'Media/Videos', 'Miscellaneous/Videos', or a lone 'Videos' bucket. Prefer an existing folder that matches "
    "the subject, or invent a specific hierarchical path (e.g. Health/Dental Lab, Work/Manufacturing, "
    "Education/Courses) that reflects what happens in the footage. "
    "For PHOTOS and image OCR: do not assign calendar or appointment folders unless the text clearly looks like "
    "a schedule, invitation, or event listing; product and medical device photos are not appointment reminders. "
    "When the original file name has a still-image extension (.jpg, .jpeg, .png, .webp, .bmp, .tif, .tiff, .heic), "
    "treat the file as a photograph or static image: do not put it under any folder path that includes a segment "
    "named Videos or Video (e.g. avoid Media/Videos/…); use a subject-only path such as Manufacturing/Dental Lab, "
    "Health/Dental Lab, or Media/Photos/… instead. Do not describe it in reason or primary_purpose as video or footage. "
    "Files with extension .pts and document_hint or excerpt showing numeric coordinate triplets are point-set/CAD/CAM "
    "data—not vCalendar or Google Calendar; never file those under Events or Appointments. "
    "For SPREADSHEETS (.xlsx, .xls, .csv): classify by the document's filing PURPOSE "
    "(e.g. Budget Forecast, Financial Model, Inventory, Project Plan, Business Projections), "
    "not only the subject domain. "
    "A plantation yield or cost worksheet with financial columns (prices, factors, projections) "
    "belongs under Finance or Business, not Agriculture, unless the user already has an Agriculture "
    "folder and the file has no financial modeling columns. "
    "If a document_hint mentions Swiss AVS / social insurance, do not file under bank statements unless the excerpt "
    "clearly shows bank transactions; do not use tax returns unless the excerpt clearly indicates a tax form. "
    "The excerpt may be in any human language (or mixed languages); read it for meaning, not layout. "
    "When folder paths include a country or region (e.g. Egypt/, United Arab Emirates/, France/), "
    "that segment must match explicit geography in the document—utility bills, government forms, and "
    "addresses in Hurghada, Canal Company electricity, EGP, or Egyptian Arabic belong under Egypt/, "
    "not United Arab Emirates/ or other countries. Do not reuse a country folder because its historical "
    "keywords mention unrelated document types (e.g. French lease samples under a UAE folder). "
    "Utility connection quotes, cost estimates (مقايسة), and electricity company forms are utility bills, "
    "not lease agreements—classify by document type and country together. "
    "When the excerpt contains [Visual] and [OCR] sections, trust [Visual] for document type if they disagree. "
    "When the excerpt contains [Structured], treat its doc_kind, issuer_country, and cue fields as "
    "authoritative hints for filing but still follow country and path safety rules below. "
    "A keyword inside a requirements or approvals checklist (e.g. railway authority) does not define the document type. "
    "Prefer document type over country for identity documents (passport, ID, visa)—file by issuer or Identity, not only geography. "
    "When a list of existing folders is given, reuse an exact name when it clearly fits (including multi-part names). "
    "Otherwise invent a precise destination—the user should not need to create folders in advance. "
    "Always reply in strict JSON with keys: folder_name, confidence, reason, primary_purpose. "
    "primary_purpose is required: one short phrase (under 12 words) for the document’s main role "
    "(e.g. “rental agreement”, “payroll tax form”, “account statement”)—distinct from employer/salary side details. "
    "folder_name is the relative destination under the output root. Use either a single segment "
    "(Title Case, 2–5 words, e.g. Invoices) OR a hierarchical path with slash: Parent/Leaf where "
    "Parent is a broad life area (e.g. Career, Finance, Housing) and Leaf is a specific type "
    f"(e.g. Job Applications, Bank Statements). At most {MAX_REL_DEST_SEGMENTS} segments; each segment "
    "2–5 words; no punctuation other than the single slash between segments; no backslashes. "
    "Prefer a shallow hierarchy only when it clearly groups related document types. "
    "confidence must be a number between 0 and 1. "
    "reason must be very short: at most 3 words when possible, or a compact phrase like "
    '(Mentions "key phrase") / (Contains "key phrase") when citing the document—no long sentences. '
    "Use Title Case for each segment in folder_name. "
    "Long files may be shown as head and tail with a short omission marker between them. "
    "If an original file name is given, it is a user-visible hint only—still prioritize document type from the excerpt. "
    "Statutory or government-style forms often mention employer, salary, bank, or accountant lines while the document’s "
    "primary purpose is something else—classify by that primary purpose, not only by those secondary keywords."
)

NARROW_TIE_SYSTEM_PROMPT = (
    "You resolve ties between two folder options. "
    "Reply in strict JSON with keys: folder_name, confidence, reason. "
    "folder_name must be exactly one of the two options given, verbatim."
)

TOP_K_JUDGE_SYSTEM_PROMPT = (
    "You choose the best folder for a document from a fixed list. "
    "Reply in strict JSON with keys: folder_name, confidence, reason."
)


def compose_sort_system_prompt(sort_system_prompt: str | None) -> str:
    """
    Build the primary classify system prompt.

    The built-in ``SYSTEM_PROMPT`` is always included. User-provided text is appended
    as a bounded overlay — it cannot replace the core JSON contract or safety rules.
    """
    custom = (sort_system_prompt or "").strip()
    if not custom:
        return SYSTEM_PROMPT
    if len(custom) > MAX_SORT_USER_PROMPT_CHARS:
        custom = custom[:MAX_SORT_USER_PROMPT_CHARS]
    return SYSTEM_PROMPT + USER_SORT_PROMPT_OVERLAY_PREFIX + custom


def excerpt_for_classification(text: str, max_len: int) -> str:
    """Head + optional middle window + tail for long inputs."""
    t = (text or "").strip()
    if len(t) <= max_len:
        return t
    sep = "\n...[middle omitted]...\n"
    if max_len >= 900:
        budget = max_len - 2 * len(sep)
        if budget >= 240:
            third = budget // 3
            rest = budget - 2 * third
            mid_start = max(0, (len(t) // 2) - third // 2)
            mid = t[mid_start : mid_start + third]
            return t[:third] + sep + mid + sep + t[-rest:]
    budget = max_len - len(sep)
    if budget < 120:
        return t[:max_len]
    head_len = budget // 2
    tail_len = budget - head_len
    return t[:head_len] + sep + t[-tail_len:]


def build_context_hint(folder_contexts: dict[str, dict]) -> str:
    """Format compact historical folder context for the model prompt."""
    if not folder_contexts:
        return ""

    lines = ["Historical folder context (reuse one when relevant):"]
    ranked = sorted(
        folder_contexts.items(),
        key=lambda item: float(item[1].get("updated_at", 0.0)),
        reverse=True,
    )[:MAX_CONTEXT_FOLDERS]

    for folder, ctx in ranked:
        samples = [s for s in ctx.get("samples", []) if isinstance(s, str) and s.strip()][:2]
        keywords = [k for k in ctx.get("keywords", []) if isinstance(k, str) and k.strip()][:6]
        parts: list[str] = []
        if keywords:
            parts.append("keywords: " + ", ".join(keywords))
        if samples:
            joined = " | ".join(s[:120] for s in samples)
            parts.append("samples: " + joined)
        if parts:
            lines.append(f"- {folder} -> " + "; ".join(parts))
        else:
            lines.append(f"- {folder}")

    return "\n".join(lines)


def default_job_language(language: str | None) -> str:
    return (language or "").strip() or DEFAULT_JOB_LANGUAGE
