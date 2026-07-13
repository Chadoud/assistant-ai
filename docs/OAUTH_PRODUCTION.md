# OAuth production ops checklist

Use this checklist outside the codebase for production connect reliability.

## Google Cloud OAuth verification

1. Open [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → OAuth consent screen.
2. Complete app verification to remove the **"Google hasn't verified this app"** warning for end users.
3. Until verified, dev/test builds rely on deterministic playbooks (`oauth_playbooks.py`) for the Advanced → unsafe proceed flow.

## Vision API billing

Autonomous connect autopilot uses vision models per consent step (budget: 8 calls per connect in `nav_decision.py`).

1. Ensure a **paid** Gemini (or Anthropic/OpenAI) tier is configured for production — free tier (20 req/day) is insufficient for multi-step OAuth.
2. Monitor quota via `orchestrator/quota_notice.py` relay events in logs.
3. Set `GEMINI_WEB_NAV_MODEL` only if you need a dedicated model for DOM/text fallback; vision relay uses the standard `Capability.VISION` chain.

## Microsoft tenant apps

If users hit admin-consent screens, they need an Entra ID admin to approve the app — autopilot returns `need_user` with explicit instructions (not a product bug).
