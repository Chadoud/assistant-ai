"""
Vision model utilities for EXO.

Provides detection of installed Ollama vision models and image description
via multimodal chat, used as a fallback when Tesseract OCR returns no text.
"""

import base64
import json
import re

from constants import OLLAMA_CHAT_OPTIONS
from llm.ollama_client import chat
from sort_structure.vision_extract import StructuredVisionExtract

# Known model name fragments that indicate multimodal / vision capability.
VISION_KEYWORDS = [
    "llava",
    "moondream",
    "bakllava",
    "minicpm-v",
    "llava-llama3",
    "llava-phi3",
]

DESCRIBE_PROMPT = (
    "Describe this document image concisely. "
    "Text may be in any language—read and summarize what you see. "
    "What type of document is it (e.g. invoice, contract, photo, form)? "
    "What is it about? Mention any dates, names, or key numbers you can read."
)

DESCRIBE_PROMPT_FILING = (
    "You are helping file this document into the correct personal folder. "
    "Describe what you see in plain language: document type, issuer or organization if visible, "
    "main purpose (e.g. insurance card, bank statement, government form, lease, passport, payslip). "
    "Text may be in any language. Mention legible headings, logos, or form codes. "
    "Do not guess a folder name—only describe the document."
)

DESCRIBE_PROMPT_FILING_STRUCTURED = (
    "You are extracting structured filing fields from a photographed document. "
    "Output ONLY valid JSON with keys: doc_kind (snake_case English, e.g. power_of_attorney, "
    "utility_cost_estimate, passport_scan, national_id_card, cash_deposit_receipt), "
    "issuer_country (English country name if visible, else null), "
    "property_cues (array of short strings: plot numbers, building names, cities, addresses), "
    "subject_cues (array: Electricity, Payments, Identity, Contracts, etc.), "
    "confidence (0-1). "
    "Read stamps, logos, headings, and MRZ if visible. Text may be Arabic, French, or English. "
    "Do not invent facts not visible on the page."
)

DESCRIBE_PROMPT_VIDEO_FRAME = (
    "This is a still frame from a user video (not a document photo). "
    "Describe the scene concretely: the environment (e.g. dental lab, metal workshop, home, office, clinic), "
    "visible equipment or objects (e.g. 3D scanner, CNC machine, dental models, phone screen, whiteboard), "
    "and what is happening. "
    "If the setting is medical, dental, manufacturing, or technical, say that explicitly. "
    "Do not use vague one-liners like 'a video recording' or 'person holding a camera' without naming the real subject. "
    "Do not suggest a folder name—only describe what is shown."
)

DESCRIBE_PROMPT_ACTIVITY = (
    "Look at this screenshot of the user's screen and describe in ONE short "
    "sentence what the user appears to be doing (the activity/task), not a list "
    "of UI elements. Be concrete but concise. If the screen is a lock screen, "
    "desktop, or empty, reply exactly: IDLE."
)


def _looks_like_degenerate_vision(text: str) -> bool:
    """Moondream via LiteLLM sometimes returns empty or repeated filler tokens."""
    t = (text or "").strip()
    if not t:
        return True
    if len(t) >= 8 and len(set(t)) <= 2:
        return True
    return False


def is_vision_capable(name: str) -> bool:
    """True if the model name matches known multimodal / vision patterns."""
    lower = name.lower()
    return any(kw in lower for kw in VISION_KEYWORDS)


def _strip_latest_tag(name: str) -> str:
    return name[:-7] if name.endswith(":latest") else name


def find_vision_model(models: list[str]) -> str | None:
    """
    Return the first installed Ollama model name that supports vision, or None.

    Args:
        models: list of model name strings from ollama.list()
    """
    for m in models:
        if is_vision_capable(m):
            return m
    return None


def resolve_vision_model(models: list[str], preferred: str | None) -> str | None:
    """
    Pick which vision model to use for extraction.

    - preferred empty / None / "auto" → first installed vision model.
    - preferred set → that install if present and vision-capable; otherwise auto.
    """
    if not preferred or not str(preferred).strip() or str(preferred).strip().lower() == "auto":
        return find_vision_model(models)
    p = str(preferred).strip()
    p_base = _strip_latest_tag(p)
    for m in models:
        m_base = _strip_latest_tag(m)
        if m == p or m_base == p_base:
            if is_vision_capable(m):
                return m
            return find_vision_model(models)
    return find_vision_model(models)


def describe_image_bytes(image_bytes: bytes, model: str, *, purpose: str = "general") -> str:
    """
    Send raw image bytes to a vision model and return a text description.

    Uses ``llm.ollama_client.chat`` so cloud sort mode routes to the VPS gateway.

    Args:
        image_bytes: PNG/JPEG bytes of the image to describe
        model:       Model name (e.g. ``moondream`` or ``llava:7b``)
        purpose:     "general", "filing", "video_frame", or "activity" (screen timeline)

    Returns:
        A plain-text description of the image content.

    Raises:
        Exception: propagated if the model is unavailable or errors.
    """
    p = (purpose or "general").strip().lower()
    if p == "activity":
        prompt = DESCRIBE_PROMPT_ACTIVITY
    elif p == "video_frame":
        prompt = DESCRIBE_PROMPT_VIDEO_FRAME
    elif p == "filing":
        prompt = DESCRIBE_PROMPT_FILING
    else:
        prompt = DESCRIBE_PROMPT
    b64 = base64.b64encode(image_bytes).decode()
    vision_messages = [
        {
            "role": "user",
            "content": prompt,
            "images": [b64],
        }
    ]
    response = chat(
        model=model,
        messages=vision_messages,
        options=OLLAMA_CHAT_OPTIONS,
    )
    content = (response.get("message") or {}).get("content", "").strip()
    if content and not _looks_like_degenerate_vision(content):
        return content
    if p == "filing":
        fallback_messages = [
            {
                "role": "user",
                "content": DESCRIBE_PROMPT,
                "images": [b64],
            }
        ]
        response = chat(
            model=model,
            messages=fallback_messages,
            options=OLLAMA_CHAT_OPTIONS,
        )
        content = (response.get("message") or {}).get("content", "").strip()
    return content


def _parse_structured_json(raw: str) -> dict | None:
    s = (raw or "").strip()
    if not s:
        return None
    try:
        obj = json.loads(s)
        return obj if isinstance(obj, dict) else None
    except json.JSONDecodeError:
        pass
    m = re.search(r"\{[\s\S]*\}", s)
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
        return obj if isinstance(obj, dict) else None
    except json.JSONDecodeError:
        return None


def describe_image_structured(image_bytes: bytes, model: str) -> StructuredVisionExtract | None:
    """
    Structured vision pass: JSON doc_kind, country, property/subject cues for filing.

    Returns None on failure or degenerate output.
    """
    b64 = base64.b64encode(image_bytes).decode()
    vision_messages = [
        {
            "role": "user",
            "content": DESCRIBE_PROMPT_FILING_STRUCTURED,
            "images": [b64],
        }
    ]
    try:
        response = chat(
            model=model,
            messages=vision_messages,
            options=OLLAMA_CHAT_OPTIONS,
        )
        content = (response.get("message") or {}).get("content", "").strip()
        if not content or _looks_like_degenerate_vision(content):
            return None
        parsed = _parse_structured_json(content)
        if not parsed:
            return None
        return StructuredVisionExtract.model_validate(parsed)
    except Exception:
        return None
