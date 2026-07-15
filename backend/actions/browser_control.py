"""Browser automation via Playwright (Chromium). Session kept open for repeated actions."""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

_pw = None
_browser = None
_context = None
_page = None


def _ensure_page():
    global _pw, _browser, _context, _page
    from playwright.sync_api import sync_playwright

    if _page is None:
        _pw = sync_playwright().start()
        _browser = _pw.chromium.launch(headless=False)
        _context = _browser.new_context()
        _page = _context.new_page()
    return _page


def browser_control(parameters: dict) -> dict:
    """
    Parameters:
        action: go_to | click | type | fill_form | get_text | screenshot | new_tab | search | back | forward
        url, selector, text, query — per action
        path — screenshot save path (must be under home)
    """
    logger.debug("[action] browser_control called args=%r", parameters)
    action = str(parameters.get("action", "go_to")).strip().lower()
    try:
        page = _ensure_page()
        home = Path.home()

        if action == "go_to":
            url = str(parameters.get("url", "")).strip()
            if not url:
                return {"ok": False, "error": "url required"}
            from safe_web_url import normalize_public_web_url

            safe = normalize_public_web_url(url)
            if not safe:
                return {"ok": False, "error": "url not allowed (public http(s) only)"}
            page.goto(safe, wait_until="domcontentloaded", timeout=60_000)
            return {"ok": True, "data": {"url": page.url}}

        if action == "search":
            q = str(parameters.get("query", "")).strip()
            if not q:
                return {"ok": False, "error": "query required"}
            page.goto(f"https://duckduckgo.com/?q={q}", wait_until="domcontentloaded", timeout=60_000)
            return {"ok": True, "data": {"url": page.url}}

        if action == "click":
            sel = str(parameters.get("selector", "")).strip()
            if not sel:
                return {"ok": False, "error": "selector required"}
            page.click(sel, timeout=30_000)
            return {"ok": True, "data": {"clicked": sel}}

        if action == "type":
            sel = str(parameters.get("selector", "")).strip()
            text = str(parameters.get("text", ""))
            if not sel:
                return {"ok": False, "error": "selector required"}
            page.fill(sel, text, timeout=30_000)
            return {"ok": True, "data": {"filled": sel}}

        if action == "fill_form":
            fields = parameters.get("fields")
            if not isinstance(fields, dict):
                return {"ok": False, "error": "fields must be an object selector -> text"}
            for sel, text in fields.items():
                page.fill(str(sel), str(text), timeout=15_000)
            return {"ok": True, "data": {"filled": list(fields.keys())}}

        if action == "get_text":
            sel = parameters.get("selector")
            if sel:
                txt = page.locator(str(sel)).inner_text(timeout=15_000)
            else:
                txt = page.inner_text("body")
            return {"ok": True, "data": {"text": txt[:8000]}}

        if action == "screenshot":
            raw = str(parameters.get("path", "")).strip()
            p = Path(raw).expanduser().resolve()
            try:
                if not p.is_relative_to(home):
                    return {"ok": False, "error": "path must be under home directory"}
            except ValueError:
                return {"ok": False, "error": "path must be under home directory"}
            p.parent.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(p), full_page=True)
            return {"ok": True, "data": {"path": str(p)}}

        if action == "new_tab":
            ctx = page.context
            np = ctx.new_page()
            global _page
            _page = np
            return {"ok": True, "data": {"note": "switched to new tab"}}

        if action == "back":
            page.go_back()
            return {"ok": True, "data": {"url": page.url}}

        if action == "forward":
            page.go_forward()
            return {"ok": True, "data": {"url": page.url}}

        return {"ok": False, "error": f"unknown action {action!r}"}
    except Exception as exc:
        logger.exception("browser_control")
        return {"ok": False, "error": str(exc)}


def close_browser_sessions() -> None:
    """Release Playwright resources (optional teardown)."""
    global _pw, _browser, _context, _page
    try:
        if _context:
            _context.close()
        if _browser:
            _browser.close()
        if _pw:
            _pw.stop()
    except Exception:
        logger.exception("close_browser_sessions")
    finally:
        _pw = _browser = _context = _page = None
