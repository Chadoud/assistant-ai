"""Telemetry business logic."""

from __future__ import annotations

from typing import Any

from .repository import TelemetryRepository
from .schemas import FeedbackIn, TelemetryBatchIn


class TelemetryService:
    def __init__(self, repo: TelemetryRepository) -> None:
        self._repo = repo

    def record_batch(self, body: TelemetryBatchIn) -> dict[str, Any]:
        if not body.events:
            return {"ok": True, "stored": 0}
        row = {
            "instance_id": body.instance_id,
            "app_version": body.app_version,
            "platform": body.platform,
            "locale": body.locale,
            "events": [e.model_dump() for e in body.events],
        }
        self._repo.insert_batch(row)
        return {"ok": True, "stored": len(body.events)}

    def record_feedback(self, body: FeedbackIn) -> dict[str, Any]:
        self._repo.insert_feedback(body.model_dump())
        return {"ok": True}
