"""
Web search action: returns inline results/answer to the calling model.

Provider selection (highest to lowest priority):
  1. SEARCH_PROVIDER env var ("gemini" | "duckduckgo") — explicit override.
  2. GEMINI_API_KEY present → GeminiGoogleSearchBackend.
  3. Fallback → DuckDuckGoBackend (requires `duckduckgo-search` package).

Optional tool parameters (all have safe defaults):
  query        (str, required)  — search string.
  max_results  (int, 1–20)      — number of results; only DDG path uses it.
  mode         (str)            — "web" (default) | "news".
  depth        (str)            — "snippet" (default) | "answer".
                                   "answer" forces Gemini path; "snippet" uses DDG.
  language     (str)            — BCP-47 language tag hint, passed to DDG when set.
"""

from __future__ import annotations

import hashlib
import logging
import os
import time
from typing import Any, Protocol

logger = logging.getLogger(__name__)

# ── Tunables ──────────────────────────────────────────────────────────────────

_MAX_RESULTS_CAP = 10          # hard ceiling for DDG max_results
_DDG_BODY_CHARS = 300          # per-result body truncation for voice payloads
_DDG_SNIPPET_RESULTS = 5       # how many results go into the joined snippet
_CACHE_TTL_S = 120.0           # result cache TTL in seconds
_CACHE_MAX_SIZE = 128           # maximum number of cached entries (LRU eviction)

# Retry: transient network errors only (not auth, not quota — those won't recover quickly).
# 3 attempts total: delays of 0.5 s, 1.0 s → max added latency ≈ 1.5 s, acceptable for voice.
_RETRY_ATTEMPTS = 3
_RETRY_BASE_DELAY_S = 0.5

# ── Gemini auth/quota error detection ────────────────────────────────────────

_GEMINI_AUTH_PATTERNS = (
    "api key not valid",
    "invalid api key",
    "api_key_invalid",
    "permission_denied",
    "unauthenticated",
    "403",
)
_GEMINI_QUOTA_PATTERNS = (
    "quota",
    "resource_exhausted",
    "429",
)


def _is_gemini_hard_failure(exc: Exception) -> bool:
    """Return True for errors where retrying with the same key won't help."""
    msg = str(exc).lower()
    return any(p in msg for p in _GEMINI_AUTH_PATTERNS)


def _is_gemini_transient(exc: Exception) -> bool:
    """Return True for quota/rate-limit errors where DDG fallback is appropriate."""
    msg = str(exc).lower()
    return any(p in msg for p in _GEMINI_QUOTA_PATTERNS)


# ── Retry helpers ─────────────────────────────────────────────────────────────

_RETRYABLE_PATTERNS = (
    "timeout", "timed out", "connection", "network", "unreachable",
    "getaddrinfo", "gaierror", "nodename", "enotfound", "dns",
    "connect timeout", "temporarily unavailable", "connection reset",
)


def _is_retryable_error(exc: Exception) -> bool:
    """
    Return True for transient network / DNS errors where retrying after a short
    delay has a reasonable chance of succeeding.

    Explicitly excluded: auth failures and quota errors — those don't recover
    within the retry window and should fail fast or fall back immediately.
    """
    if _is_gemini_hard_failure(exc) or _is_gemini_transient(exc):
        return False
    msg = str(exc).lower()
    return any(p in msg for p in _RETRYABLE_PATTERNS)


def _call_with_retry(
    backend: "SearchBackend",
    query: str,
    *,
    max_results: int,
    mode: str,
    language: str,
) -> dict:
    """
    Call backend.search(...) with up to _RETRY_ATTEMPTS total attempts.

    Only retries on retryable transient network errors. Non-retryable errors
    (auth, quota, blocked) are re-raised immediately so the caller can handle
    them without wasting time on futile retries.
    """
    for attempt in range(_RETRY_ATTEMPTS):
        try:
            return backend.search(
                query, max_results=max_results, mode=mode, language=language
            )
        except Exception as exc:
            is_last = attempt == _RETRY_ATTEMPTS - 1
            if not _is_retryable_error(exc) or is_last:
                raise
            delay = _RETRY_BASE_DELAY_S * (2 ** attempt)
            logger.warning(
                "[action] web_search transient error (attempt %d/%d), retrying in %.1fs: %s",
                attempt + 1,
                _RETRY_ATTEMPTS,
                delay,
                exc,
            )
            time.sleep(delay)

    raise AssertionError("unreachable")  # type: ignore[misc]


# ── Simple TTL + LRU cache ────────────────────────────────────────────────────

class _CacheEntry:
    __slots__ = ("value", "inserted_at")

    def __init__(self, value: dict) -> None:
        self.value = value
        self.inserted_at = time.monotonic()


class _SearchCache:
    """Thread-safe enough for single-process use (GIL protects dict ops)."""

    def __init__(self, ttl: float, max_size: int) -> None:
        self._ttl = ttl
        self._max_size = max_size
        self._store: dict[str, _CacheEntry] = {}

    def _cache_key(self, query: str, engine: str, max_results: int, mode: str) -> str:
        raw = f"{query.lower().strip()}|{engine}|{max_results}|{mode}"
        return hashlib.md5(raw.encode(), usedforsecurity=False).hexdigest()

    def get(self, query: str, engine: str, max_results: int, mode: str) -> dict | None:
        key = self._cache_key(query, engine, max_results, mode)
        entry = self._store.get(key)
        if entry is None:
            return None
        if time.monotonic() - entry.inserted_at > self._ttl:
            self._store.pop(key, None)
            return None
        # Refresh insertion order (LRU touch) by re-inserting
        self._store.pop(key)
        self._store[key] = entry
        return entry.value

    def set(self, query: str, engine: str, max_results: int, mode: str, value: dict) -> None:
        key = self._cache_key(query, engine, max_results, mode)
        if len(self._store) >= self._max_size:
            # Evict oldest entry
            oldest_key = next(iter(self._store))
            self._store.pop(oldest_key, None)
        self._store[key] = _CacheEntry(value)


_cache = _SearchCache(ttl=_CACHE_TTL_S, max_size=_CACHE_MAX_SIZE)


# ── Backend protocol ──────────────────────────────────────────────────────────

class SearchBackend(Protocol):
    """Minimal callable interface every search backend must satisfy."""

    def search(
        self,
        query: str,
        *,
        max_results: int,
        mode: str,
        language: str,
    ) -> dict:
        """Return {"ok": bool, "data": {...}, "engine": str} or {"ok": False, "error": str}."""
        ...


# ── Gemini Google Search backend ──────────────────────────────────────────────

class GeminiGoogleSearchBackend:
    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    def search(
        self,
        query: str,
        *,
        max_results: int,  # noqa: ARG002 — Gemini search returns what it returns
        mode: str,         # noqa: ARG002 — grounding tool handles query intent
        language: str,     # noqa: ARG002 — model follows query language natively
    ) -> dict:
        from google import genai  # type: ignore[import]
        from google.genai import types  # type: ignore[import]

        client = genai.Client(api_key=self._api_key)
        model = os.environ.get("GEMINI_SEARCH_MODEL", "gemini-2.0-flash")
        prompt = f"Answer briefly with citations if search results help:\n{query}"
        resp = client.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
            ),
        )
        answer = (resp.text or "").strip()
        return {"ok": True, "data": {"answer": answer}, "engine": "gemini_google_search"}


# ── DuckDuckGo helpers ────────────────────────────────────────────────────────

def _import_ddgs():
    """Import the DDGS class from whichever package name is installed."""
    import warnings
    try:
        from ddgs import DDGS  # type: ignore[import-untyped]
        return DDGS
    except ImportError:
        pass
    try:
        # duckduckgo_search emits a RuntimeWarning about being renamed to ddgs.
        # We already try ddgs first above; suppress the warning here since this
        # is an intentional fallback, not a usage error.
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", category=RuntimeWarning, module="duckduckgo_search")
            from duckduckgo_search import DDGS  # type: ignore[import-untyped]
        return DDGS
    except ImportError as exc:
        raise RuntimeError(
            "No DuckDuckGo search package found. "
            "Run: pip install ddgs"
        ) from exc


def _classify_ddg_error(exc: Exception) -> Exception:
    """
    Translate a raw DDG / network exception into a short, user-readable message
    that the voice model can relay without exposing internal URLs or stack traces.
    """
    msg = str(exc).lower()
    if "timeout" in msg or "timed out" in msg:
        return RuntimeError(
            "The search timed out — the search engine did not respond in time."
        )
    if "ratelimit" in msg or "rate limit" in msg or "429" in msg:
        return RuntimeError(
            "The search service rate-limited this request — please try again in a moment."
        )
    if "blocked" in msg or "403" in msg:
        return RuntimeError(
            "The search service is temporarily blocking requests from this network."
        )
    if "connection" in msg or "network" in msg or "unreachable" in msg:
        return RuntimeError(
            "Could not reach the search service — check network connectivity."
        )
    return RuntimeError(f"Search failed: {exc}")


# ── DuckDuckGo backend ────────────────────────────────────────────────────────

class DuckDuckGoBackend:
    def search(
        self,
        query: str,
        *,
        max_results: int,
        mode: str,
        language: str,
    ) -> dict:
        DDGS = _import_ddgs()

        capped = min(max_results, _MAX_RESULTS_CAP)
        kwargs: dict[str, Any] = {"max_results": capped}
        if language:
            kwargs["region"] = language

        try:
            import warnings as _warnings
            with _warnings.catch_warnings():
                _warnings.filterwarnings("ignore", category=RuntimeWarning, module="duckduckgo_search")
                with DDGS() as ddgs:
                    if mode == "news":
                        # The news endpoint is frequently rate-limited / 403'd.
                        # If it yields nothing, fall back to a plain text search
                        # so headlines still come through instead of failing the
                        # whole section (news is the first briefing item).
                        try:
                            raw = list(ddgs.news(query, **kwargs))
                        except Exception as news_exc:
                            logger.info(
                                "[action] web_search news endpoint failed (%s) — retrying as text search",
                                news_exc,
                            )
                            raw = []
                        if not raw:
                            raw = list(ddgs.text(query, **kwargs))
                    else:
                        raw = list(ddgs.text(query, **kwargs))
        except Exception as exc:
            raise _classify_ddg_error(exc) from exc

        results = [
            {
                "title": r.get("title"),
                "href": r.get("href") or r.get("url"),
                "body": (r.get("body") or r.get("excerpt") or "")[:_DDG_BODY_CHARS],
            }
            for r in raw
        ]
        # Include title-only lines so news mode still yields usable briefing text
        # when providers return empty bodies (previously the whole snippet was blank).
        snippet_lines: list[str] = []
        for r in results[:_DDG_SNIPPET_RESULTS]:
            title = (r.get("title") or "").strip()
            body = (r.get("body") or "").strip()
            if title and body:
                snippet_lines.append(f"- {title}: {body}")
            elif title:
                snippet_lines.append(f"- {title}")
        snippet = "\n".join(snippet_lines)
        return {
            "ok": True,
            "data": {"results": results, "snippet": snippet},
            "engine": "duckduckgo",
        }


# ── Provider resolution ───────────────────────────────────────────────────────

def _resolve_backend(depth: str) -> tuple[SearchBackend | None, SearchBackend]:
    """
    Return (primary, fallback) backends.

    primary is None when only DDG is available. The caller tries primary first
    and falls back to the returned fallback on transient/auth failure.
    """
    explicit = os.environ.get("SEARCH_PROVIDER", "").strip().lower()
    if explicit == "duckduckgo":
        return None, DuckDuckGoBackend()

    if explicit == "gemini" or os.environ.get("GEMINI_API_KEY", "").strip():
        api_key = os.environ.get("GEMINI_API_KEY", "").strip()
        if api_key and depth != "snippet":
            return GeminiGoogleSearchBackend(api_key), DuckDuckGoBackend()

    return None, DuckDuckGoBackend()


# ── Public entry point ────────────────────────────────────────────────────────

def web_search(parameters: dict) -> dict:
    """
    Search the web and return inline results to the calling model.

    Parameters:
        query        (str, required)
        max_results  (int, default 8, max 10)
        mode         ("web" | "news", default "web")
        depth        ("snippet" | "answer", default "answer")
        language     (str, default "")
    """
    logger.debug("[action] web_search called args=%r", parameters)

    query = str(parameters.get("query", "")).strip()
    if not query:
        return {"ok": False, "error": "query is required"}

    max_results = min(int(parameters.get("max_results", 8) or 8), _MAX_RESULTS_CAP)
    mode = str(parameters.get("mode", "web") or "web").strip().lower()
    depth = str(parameters.get("depth", "answer") or "answer").strip().lower()
    language = str(parameters.get("language", "") or "").strip()

    if mode not in ("web", "news"):
        mode = "web"
    if depth not in ("snippet", "answer"):
        depth = "answer"

    primary, fallback = _resolve_backend(depth)

    # Use engine name as cache key discriminator
    primary_engine = getattr(primary, "__class__", type(fallback)).__name__

    cached = _cache.get(query, primary_engine, max_results, mode)
    if cached is not None:
        logger.debug("[action] web_search cache HIT engine=%s query=%.60r", primary_engine, query)
        return cached

    kwargs = dict(max_results=max_results, mode=mode, language=language)

    if primary is not None:
        try:
            result = _call_with_retry(primary, query, **kwargs)
            _cache.set(query, primary_engine, max_results, mode, result)
            return result
        except Exception as exc:
            if _is_gemini_hard_failure(exc):
                logger.error(
                    "[action] web_search Gemini auth/permission failure — not falling back: %s", exc
                )
                return {"ok": False, "error": f"Search auth error: {exc}"}
            if _is_gemini_transient(exc):
                logger.warning(
                    "[action] web_search Gemini quota/rate-limit — falling back to DDG: %s", exc
                )
            else:
                logger.warning(
                    "[action] web_search primary backend failed after retries — falling back to DDG: %s",
                    exc,
                )

    try:
        result = _call_with_retry(fallback, query, **kwargs)
        _cache.set(query, "DuckDuckGoBackend", max_results, mode, result)
        return result
    except Exception as exc:
        logger.exception("[action] web_search DDG fallback failed after retries")
        # Return a clean, model-readable error — not a raw URL or stack trace.
        return {"ok": False, "error": str(exc) if str(exc) else "Search failed — please try again."}
