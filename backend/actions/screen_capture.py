"""Capture screen with mss and describe via Gemini vision (used after user consent)."""

from __future__ import annotations

import base64
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


def screen_capture(parameters: dict) -> dict:
    """
    Parameters:
        question: optional question about the screen (default: describe UI)
    """
    logger.debug("[action] screen_capture called args=%r", parameters)
    question = str(parameters.get("question", "Describe what is visible on the screen briefly.")).strip()

    try:
        import io

        import mss  # type: ignore[import-untyped]
        from mss import tools as mss_tools
        from PIL import Image
    except ImportError as exc:
        return {"ok": False, "error": f"mss/Pillow required: {exc}"}

    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        return {"ok": False, "error": "GEMINI_API_KEY not configured"}

    try:
        with mss.mss() as sct:
            mon = sct.monitors[1]
            shot = sct.grab(mon)
            png_bytes = mss_tools.to_png(shot.rgb, shot.size)
        img = Image.open(io.BytesIO(png_bytes)).convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=82)
        jpeg_bytes = buf.getvalue()
    except Exception as exc:
        logger.exception("screen capture")
        return {"ok": False, "error": str(exc)}

    try:
        from google import genai  # type: ignore[import]
        from google.genai import types  # type: ignore[import]

        client = genai.Client(api_key=api_key)
        model = os.environ.get("GEMINI_VISION_MODEL", "gemini-2.0-flash")
        parts: list[Any] = [
            types.Part.from_text(text=question),
            types.Part.from_bytes(data=jpeg_bytes, mime_type="image/jpeg"),
        ]
        resp = client.models.generate_content(model=model, contents=[types.Content(parts=parts)])
        answer = (resp.text or "").strip()
        return {
            "ok": True,
            "data": {
                "answer": answer,
                "image_b64": base64.b64encode(jpeg_bytes).decode("ascii"),
                "model": model,
            },
        }
    except Exception as exc:
        logger.exception("screen_capture vision")
        return {"ok": False, "error": str(exc)}
