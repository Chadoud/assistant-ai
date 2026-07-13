"""Public client-config shape aligned with cloud `GET /v1/public/client-config` + telemetry hints.

Policy constants: cloud-node/lib/clientPolicy.js (keep POLICY_VERSION in sync).
"""

from __future__ import annotations

from fastapi import APIRouter

from crash_reports.config import crash_reports_ingest_enabled
from entitlement_constants import FREE_TRIAL_DAYS

router = APIRouter(prefix="/v1/public", tags=["public"])

# Bump when policy / client contract changes (align with cloud `policy_version` when deployed together).
POLICY_VERSION = 1
MIN_SUPPORTED_CLIENT = "1.0.0"


@router.get("/client-config")
def client_config() -> dict:
    return {
        "min_supported_client": MIN_SUPPORTED_CLIENT,
        "policy_version": POLICY_VERSION,
        "free_trial_days": FREE_TRIAL_DAYS,
        "telemetry_ingest_enabled": True,
        "feedback_ingest_enabled": True,
        "crash_reports_ingest_enabled": crash_reports_ingest_enabled(),
    }
