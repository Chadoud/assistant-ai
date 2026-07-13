"""
POST /vision/screen — analyze a screen or webcam capture with the local Ollama vision model.

Request body: { image_b64: str, question: str }
Response:     { answer: str, model: str }
"""

from __future__ import annotations

import base64
import logging

import ollama
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from vision import find_vision_model

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/vision", tags=["vision"])

_SCREEN_PROMPT_TEMPLATE = (
    "You are analyzing a screenshot of the user's screen.\n"
    "Question: {question}\n\n"
    "Describe what you see and answer the question concisely. "
    "Focus on the relevant content visible in the image."
)


class VisionScreenRequest(BaseModel):
    image_b64: str = Field(..., min_length=10)
    question: str = Field(default="What do you see in this screenshot?", max_length=2048)


@router.post("/screen")
async def analyze_screen(body: VisionScreenRequest) -> dict[str, str]:
    # Discover an available vision-capable model
    try:
        models_resp = ollama.list()
        model_names = [m.model for m in (models_resp.models or [])]
    except Exception as exc:
        logger.exception("Failed to list Ollama models")
        raise HTTPException(status_code=503, detail=f"Ollama unavailable: {exc}") from exc

    model = find_vision_model(model_names)
    if not model:
        raise HTTPException(
            status_code=422,
            detail="No vision-capable Ollama model found. Install llava, moondream, or a compatible model.",
        )

    try:
        image_bytes = base64.b64decode(body.image_b64)
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Invalid base64 image data") from exc

    prompt = _SCREEN_PROMPT_TEMPLATE.format(question=body.question.strip() or "What do you see?")

    try:
        # Patch the prompt into the vision helper by calling ollama directly
        response = ollama.chat(
            model=model,
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                    "images": [image_bytes],
                }
            ],
        )
        answer = (response.message.content or "").strip()
    except Exception as exc:
        logger.exception("Vision model error")
        raise HTTPException(status_code=500, detail=f"Vision model error: {exc}") from exc

    return {"answer": answer, "model": model}
