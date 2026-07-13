"""Google Flights helper: open search URL and extract flight-like text via Gemini."""

from __future__ import annotations

import logging
import os
import urllib.parse
from datetime import datetime

logger = logging.getLogger(__name__)


def flight_finder(parameters: dict) -> dict:
    """
    Parameters:
        origin: IATA code e.g. ZRH
        destination: IATA code e.g. JFK
        outbound_date: YYYY-MM-DD
        return_date: optional YYYY-MM-DD
    """
    logger.debug("[action] flight_finder called args=%r", parameters)
    origin = str(parameters.get("origin", "")).strip().upper()
    dest = str(parameters.get("destination", "")).strip().upper()
    out_d = str(parameters.get("outbound_date", "")).strip()
    ret_d = str(parameters.get("return_date", "")).strip()

    if len(origin) != 3 or len(dest) != 3:
        return {"ok": False, "error": "origin and destination must be 3-letter IATA codes"}

    try:
        datetime.strptime(out_d, "%Y-%m-%d")
        if ret_d:
            datetime.strptime(ret_d, "%Y-%m-%d")
    except ValueError:
        return {"ok": False, "error": "Dates must be YYYY-MM-DD"}

    # Google Flights search URL (best-effort)
    base = "https://www.google.com/travel/flights"
    q = f"{origin} to {dest} on {out_d}"
    if ret_d:
        q += f" return {ret_d}"
    url = f"{base}?q={urllib.parse.quote(q)}"

    text = ""
    try:
        from actions.browser_control import browser_control as browser_run

        r = browser_run({"action": "go_to", "url": url})
        if not r.get("ok"):
            return r
        page_text = browser_run({"action": "get_text"})
        if not page_text.get("ok"):
            return page_text
        text = str(page_text.get("data", {}).get("text", ""))[:12000]
    except Exception as exc:
        logger.exception("flight browser")
        return {"ok": False, "error": str(exc), "data": {"search_url": url}}

    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        return {"ok": True, "data": {"search_url": url, "page_excerpt": text[:2000]}}

    try:
        from google import genai  # type: ignore[import]

        client = genai.Client(api_key=api_key)
        prompt = (
            "Extract up to 6 flight options from this page text as JSON array of "
            "{airline, departure, arrival, price, stops}. If unclear, summarize availability.\n\n"
            + text
        )
        resp = client.models.generate_content(model="gemini-2.0-flash", contents=prompt)
        return {"ok": True, "data": {"analysis": (resp.text or "").strip(), "search_url": url}}
    except Exception as exc:
        return {"ok": True, "data": {"search_url": url, "page_excerpt": text[:2000], "warning": str(exc)}}
