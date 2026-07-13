"""
Unified Ollama access for classify, embed, and health checks.

Local mode delegates to the ``ollama`` Python package (desktop ``ollama serve``).
Remote mode speaks OpenAI-compatible HTTP to LiteLLM (``/v1/chat/completions``,
``/v1/embeddings``, ``/v1/models``).
"""

from __future__ import annotations

import logging
import os
import random
import re
import threading
import time
import uuid
from pathlib import Path
from typing import Any

import httpx

from constants import _env_bool, _env_int
from user_facing_errors import format_remote_llm_http_error

logger = logging.getLogger(__name__)

_DEFAULT_LOCAL_HOST = "http://127.0.0.1:11434"
_STAGING_CANONICAL_HOST = "https://llm-staging.exosites.ch"
_BLOCKED_DIRECT_HTTP_PORT = re.compile(r"^http://[\d.]+:4000$", re.IGNORECASE)
_RETRYABLE_STATUS = frozenset({429, 503})
_DEFAULT_TIMEOUT_S = 120.0
_DEFAULT_MAX_RETRIES = 3

_slot_lock = threading.Lock()
_slot_semaphore: threading.Semaphore | None = None
_configured_slot_limit: int | None = None


class RemoteOllamaError(RuntimeError):
    """Raised when a local-only Ollama operation is attempted in remote mode."""


class OllamaClientError(RuntimeError):
    """Raised when an inference request fails after retries."""


def is_remote_mode() -> bool:
    """True when the backend should call LiteLLM instead of local ``ollama serve``.

    Default is **remote** (Exo VPS). Local ``ollama serve`` is test-only via
    ``OLLAMA_MODE=local`` — see ``docs/CLOUD_LLM_ONLY.md``.
    """
    mode = (os.environ.get("OLLAMA_MODE") or "remote").strip().lower()
    if mode == "local":
        return False
    if _env_bool("EXOSITES_REMOTE_LLM", False):
        return True
    return mode == "remote"


def _normalize_remote_host(raw: str) -> str:
    """
    Rewrite firewalled bare ``http://IP:4000`` hosts to the TLS gateway hostname.

    Infomaniak exposes LiteLLM on 443 via Caddy; direct :4000 is blocked off-VPS.
    """
    host = raw.rstrip("/")
    if not host or not _BLOCKED_DIRECT_HTTP_PORT.match(host):
        return host
    canonical = (
        os.environ.get("EXOSITES_SORT_LLM_CANONICAL_HOST") or _STAGING_CANONICAL_HOST
    ).strip().rstrip("/")
    if canonical and canonical != host:
        logger.warning("OLLAMA_HOST %s is not reachable externally; using %s", host, canonical)
    return canonical or host


def ollama_host() -> str:
    """Base URL for Ollama (local) or LiteLLM gateway (remote)."""
    raw = (os.environ.get("OLLAMA_HOST") or os.environ.get("OLLAMA_BASE_URL") or "").strip()
    if not raw:
        return _STAGING_CANONICAL_HOST if is_remote_mode() else _DEFAULT_LOCAL_HOST
    host = raw.rstrip("/")
    if is_remote_mode():
        host = _normalize_remote_host(host)
    return host


def _managed_backend_overrides() -> dict[str, str]:
    """Read Electron-managed sort credentials (refreshed without backend restart)."""
    ud = (os.environ.get("EXOSITES_USER_DATA") or "").strip()
    if not ud:
        return {}
    path = Path(ud) / "backend-env-overrides.json"
    if not path.is_file():
        return {}
    try:
        import json

        raw = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            return {}
        managed = raw.get("EXOSITES_SORT_CREDENTIALS_MANAGED")
        if managed not in ("1", 1, True):
            return {}
        out: dict[str, str] = {}
        for key, value in raw.items():
            if value is None or value == "":
                continue
            out[str(key)] = str(value)
        return out
    except (OSError, ValueError, TypeError):
        return {}


def _api_key() -> str:
    overrides = _managed_backend_overrides()
    key = (overrides.get("OLLAMA_API_KEY") or "").strip()
    if key:
        return key
    return (os.environ.get("OLLAMA_API_KEY") or "").strip()


def _request_timeout_s() -> float:
    raw = os.environ.get("OLLAMA_REQUEST_TIMEOUT_S")
    if raw is None or str(raw).strip() == "":
        return _DEFAULT_TIMEOUT_S
    try:
        return max(5.0, float(raw))
    except ValueError:
        return _DEFAULT_TIMEOUT_S


def _max_retries() -> int:
    return max(0, min(8, _env_int("OLLAMA_MAX_RETRIES", _DEFAULT_MAX_RETRIES)))


def _max_slots() -> int:
    return max(0, _env_int("EXOSITES_LLM_MAX_SLOTS", 0))


def _slot_wait_timeout_s() -> float:
    """Max time to wait for a local admission slot before failing (0 = wait forever)."""
    raw = os.environ.get("EXOSITES_LLM_SLOT_WAIT_S")
    if raw is None or str(raw).strip() == "":
        return 600.0
    try:
        return max(0.0, float(raw))
    except ValueError:
        return 600.0


def _acquire_slot() -> None:
    """Optional client-side admission for remote chat/embed (0 = disabled)."""
    global _slot_semaphore, _configured_slot_limit
    limit = _max_slots()
    if not is_remote_mode() or limit <= 0:
        return
    with _slot_lock:
        if _slot_semaphore is None or _configured_slot_limit != limit:
            _slot_semaphore = threading.Semaphore(limit)
            _configured_slot_limit = limit
    assert _slot_semaphore is not None
    wait_budget = _slot_wait_timeout_s()
    if wait_budget <= 0:
        _slot_semaphore.acquire()
        return
    deadline = time.monotonic() + wait_budget
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise OllamaClientError(
                "Sort LLM is busy on this device — waited for a free slot. "
                "Try again in a moment or lower parallel sort settings."
            )
        acquired = _slot_semaphore.acquire(timeout=min(2.0, remaining))
        if acquired:
            return


def _release_slot() -> None:
    limit = _max_slots()
    if not is_remote_mode() or limit <= 0:
        return
    if _slot_semaphore is not None:
        _slot_semaphore.release()


def _request_id() -> str:
    return (os.environ.get("EXOSITES_REQUEST_ID") or "").strip() or uuid.uuid4().hex


def _openai_headers() -> dict[str, str]:
    headers = {
        "Content-Type": "application/json",
        "X-Request-ID": _request_id(),
    }
    key = _api_key()
    if key:
        headers["Authorization"] = f"Bearer {key}"
    return headers


def _retry_after_seconds(response: httpx.Response) -> float | None:
    raw = response.headers.get("Retry-After")
    if not raw:
        return None
    try:
        return max(0.0, float(raw))
    except ValueError:
        return None


def _backoff_seconds(attempt: int, response: httpx.Response | None) -> float:
    if response is not None:
        retry_after = _retry_after_seconds(response)
        if retry_after is not None:
            return retry_after
    base = min(30.0, 0.5 * (2**attempt))
    return base + random.uniform(0.0, 0.25)


def _sort_queue_url() -> str:
    """Public HTTPS base for the VPS Redis inference queue (optional)."""
    overrides = _managed_backend_overrides()
    raw = (
        overrides.get("EXOSITES_SORT_QUEUE_URL")
        or os.environ.get("EXOSITES_SORT_QUEUE_URL")
        or ""
    ).strip()
    if not raw:
        return ""
    host = raw.rstrip("/")
    if is_remote_mode():
        host = _normalize_remote_host(host)
    return host


_QUEUE_INFERENCE_PATHS = frozenset({"/v1/chat/completions", "/v1/embeddings"})


def _uses_sort_queue(path: str) -> bool:
    return bool(is_remote_mode() and _sort_queue_url() and path in _QUEUE_INFERENCE_PATHS)


def _request_json(
    method: str,
    path: str,
    *,
    json_body: dict[str, Any] | None = None,
    require_auth: bool = False,
) -> dict[str, Any]:
    if _uses_sort_queue(path):
        return _queue_request_json(method, path, json_body=json_body, require_auth=require_auth)
    return _direct_request_json(method, path, json_body=json_body, require_auth=require_auth)


def _queue_request_json(
    method: str,
    path: str,
    *,
    json_body: dict[str, Any] | None = None,
    require_auth: bool = False,
) -> dict[str, Any]:
    if require_auth and not _api_key():
        raise OllamaClientError("OLLAMA_API_KEY is required for remote inference")

    url = f"{_sort_queue_url()}/v1/sort/inference"
    timeout = _request_timeout_s() + 30.0
    max_retries = _max_retries()
    envelope = {"method": method, "path": path, "body": json_body or {}}
    last_error: str | None = None

    for attempt in range(max_retries + 1):
        started = time.perf_counter()
        try:
            with httpx.Client(timeout=timeout) as client:
                response = client.post(url, headers=_openai_headers(), json=envelope)
        except httpx.HTTPError as exc:
            last_error = str(exc)
            if attempt >= max_retries:
                break
            time.sleep(_backoff_seconds(attempt, None))
            continue

        latency_ms = int((time.perf_counter() - started) * 1000)
        if response.status_code < 400:
            try:
                data = response.json()
            except ValueError as exc:
                raise OllamaClientError(f"Invalid JSON from sort queue: {exc}") from exc
            logger.debug(
                "sort queue %s %s status=%s latency_ms=%s",
                method,
                path,
                response.status_code,
                latency_ms,
            )
            return data if isinstance(data, dict) else {"data": data}

        last_error = format_remote_llm_http_error(response.status_code, response.text)
        logger.warning(
            "sort queue %s %s failed status=%s latency_ms=%s attempt=%s",
            method,
            path,
            response.status_code,
            latency_ms,
            attempt,
        )
        if response.status_code not in _RETRYABLE_STATUS or attempt >= max_retries:
            break
        if response.status_code in _RETRYABLE_STATUS:
            time.sleep(random.uniform(0.05, 0.35))
        time.sleep(_backoff_seconds(attempt, response))

    raise OllamaClientError(last_error or "sort queue request failed")


def _direct_request_json(
    method: str,
    path: str,
    *,
    json_body: dict[str, Any] | None = None,
    require_auth: bool = False,
) -> dict[str, Any]:
    if require_auth and not _api_key():
        raise OllamaClientError("OLLAMA_API_KEY is required for remote inference")

    url = f"{ollama_host()}{path}"
    timeout = _request_timeout_s()
    max_retries = _max_retries()
    last_error: str | None = None

    for attempt in range(max_retries + 1):
        started = time.perf_counter()
        try:
            with httpx.Client(timeout=timeout) as client:
                response = client.request(method, url, headers=_openai_headers(), json=json_body)
        except httpx.HTTPError as exc:
            last_error = str(exc)
            if attempt >= max_retries:
                break
            time.sleep(_backoff_seconds(attempt, None))
            continue

        latency_ms = int((time.perf_counter() - started) * 1000)
        if response.status_code < 400:
            try:
                data = response.json()
            except ValueError as exc:
                raise OllamaClientError(f"Invalid JSON from {path}: {exc}") from exc
            logger.debug(
                "ollama remote %s %s status=%s latency_ms=%s",
                method,
                path,
                response.status_code,
                latency_ms,
            )
            return data if isinstance(data, dict) else {"data": data}

        last_error = format_remote_llm_http_error(response.status_code, response.text)
        logger.warning(
            "ollama remote %s %s failed status=%s latency_ms=%s attempt=%s",
            method,
            path,
            response.status_code,
            latency_ms,
            attempt,
        )
        if response.status_code not in _RETRYABLE_STATUS or attempt >= max_retries:
            break
        if response.status_code in _RETRYABLE_STATUS:
            time.sleep(random.uniform(0.05, 0.35))
        time.sleep(_backoff_seconds(attempt, response))

    raise OllamaClientError(last_error or "remote Ollama request failed")


def sort_queue_enabled() -> bool:
    """True when classify/embed should route through the VPS Redis queue."""
    return bool(_sort_queue_url())


def sort_credentials_managed() -> bool:
    """True when Electron syncs Exo cloud sort keys (full VPS inference, no local LLM merge)."""
    return bool(_managed_backend_overrides())


def _ollama_native_messages_to_openai(messages: list[Any]) -> list[dict[str, Any]]:
    """Convert Ollama chat messages (optional ``images`` base64) to OpenAI multimodal parts."""
    out: list[dict[str, Any]] = []
    for msg in messages:
        if not isinstance(msg, dict):
            continue
        role = str(msg.get("role") or "user")
        content = msg.get("content", "")
        images = msg.get("images") or []
        if images:
            parts: list[dict[str, Any]] = []
            text = str(content or "").strip()
            if text:
                parts.append({"type": "text", "text": text})
            for img in images:
                raw = str(img).strip()
                if not raw:
                    continue
                url = raw if raw.startswith("data:") else f"data:image/jpeg;base64,{raw}"
                parts.append({"type": "image_url", "image_url": {"url": url}})
            out.append({"role": role, "content": parts})
        else:
            out.append({"role": role, "content": str(content or "")})
    return out


def _openai_chat_to_ollama(data: dict[str, Any]) -> dict[str, Any]:
    choices = data.get("choices") or []
    content = ""
    if choices and isinstance(choices[0], dict):
        message = choices[0].get("message") or {}
        if isinstance(message, dict):
            content = str(message.get("content") or "")
    usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
    return {
        "message": {"content": content},
        "prompt_eval_count": usage.get("prompt_tokens", 0),
        "eval_count": usage.get("completion_tokens", 0),
    }


def _local_chat(**kwargs: Any) -> dict[str, Any]:
    import ollama

    host = ollama_host()
    if host != _DEFAULT_LOCAL_HOST:
        os.environ["OLLAMA_HOST"] = host
    if kwargs.pop("stream", False):
        raise OllamaClientError("streaming chat is not supported via ollama_client.chat")
    return ollama.chat(**kwargs)


def _remote_chat(**kwargs: Any) -> dict[str, Any]:
    if kwargs.pop("stream", False):
        raise OllamaClientError("streaming chat is not supported via ollama_client.chat")
    model = str(kwargs.get("model") or "").strip()
    raw_messages = kwargs.get("messages") or []
    messages = _ollama_native_messages_to_openai(raw_messages)
    options = kwargs.get("options") if isinstance(kwargs.get("options"), dict) else {}
    temperature = float(options.get("temperature", 0.1))
    body: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
    }
    has_image = any(
        isinstance(m, dict)
        and isinstance(m.get("content"), list)
        and any(isinstance(p, dict) and p.get("type") == "image_url" for p in m["content"])
        for m in messages
    )
    if has_image:
        body["max_tokens"] = int(options.get("num_predict") or options.get("max_tokens") or 512)
    data = _request_json("POST", "/v1/chat/completions", json_body=body, require_auth=True)
    return _openai_chat_to_ollama(data)


def chat(**kwargs: Any) -> dict[str, Any]:
    """
    Chat completion compatible with ``ollama.chat`` response shape.

    @param kwargs: ``model``, ``messages``, optional ``options``, ``stream`` (non-stream only).
    @returns Dict with ``message.content`` and optional token usage keys.
    @raises OllamaClientError: On remote failures after retries.
    """
    _acquire_slot()
    try:
        if is_remote_mode():
            return _remote_chat(**kwargs)
        return _local_chat(**kwargs)
    finally:
        _release_slot()


def _local_embeddings(*, model: str, prompt: str) -> dict[str, Any]:
    import ollama

    host = ollama_host()
    if host != _DEFAULT_LOCAL_HOST:
        os.environ["OLLAMA_HOST"] = host
    return ollama.embeddings(model=model, prompt=prompt)


def _remote_embeddings(*, model: str, prompt: str) -> dict[str, Any]:
    body = {"model": model, "input": prompt}
    data = _request_json("POST", "/v1/embeddings", json_body=body, require_auth=True)
    rows = data.get("data") or []
    embedding: list[float] = []
    if rows and isinstance(rows[0], dict):
        raw = rows[0].get("embedding")
        if isinstance(raw, list):
            embedding = [float(x) for x in raw]
    return {"embedding": embedding}


def embeddings(*, model: str, prompt: str) -> dict[str, Any]:
    """
    Embedding vector compatible with ``ollama.embeddings`` response shape.

    @param model: Embedding model name (e.g. ``nomic-embed-text``).
    @param prompt: Text to embed.
    @returns Dict with ``embedding`` list.
    """
    _acquire_slot()
    try:
        if is_remote_mode():
            return _remote_embeddings(model=model, prompt=prompt)
        return _local_embeddings(model=model, prompt=prompt)
    finally:
        _release_slot()


def list_models_response() -> dict[str, Any]:
    """Return Ollama-shaped ``{"models": [...]}`` payload."""
    if is_remote_mode():
        data = _request_json("GET", "/v1/models", require_auth=bool(_api_key()))
        rows = data.get("data") or []
        models = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            model_id = str(row.get("id") or row.get("model") or "").strip()
            if model_id:
                models.append({"model": model_id, "name": model_id})
        return {"models": models}

    import ollama

    host = ollama_host()
    if host != _DEFAULT_LOCAL_HOST:
        os.environ["OLLAMA_HOST"] = host
    return ollama.list()


def _local_model_names() -> list[str]:
    """Names from desktop ``ollama serve`` (always 127.0.0.1), even in remote sort mode."""
    try:
        import ollama

        client = ollama.Client(host=_DEFAULT_LOCAL_HOST)
        payload = client.list()
        if hasattr(payload, "model_dump"):
            payload = payload.model_dump()
        elif not isinstance(payload, dict):
            payload = {"models": getattr(payload, "models", [])}
        rows = payload.get("models") or []
        names: list[str] = []
        for row in rows:
            if isinstance(row, dict):
                name = row.get("model")
            else:
                name = getattr(row, "model", None)
            if name:
                names.append(str(name))
        return names
    except Exception:
        return []


def _merge_remote_and_local_vision(remote_names: list[str], local_names: list[str]) -> list[str]:
    """Remote sort models plus locally installed vision models for Settings / OCR fallback."""
    from vision import is_vision_capable

    merged = list(remote_names)
    seen = {n.lower() for n in merged}
    for name in local_names:
        if not is_vision_capable(name):
            continue
        key = name.lower()
        if key in seen:
            continue
        merged.append(name)
        seen.add(key)
    return merged


def list_model_names() -> list[str]:
    """Installed model names for classify resolution and Settings UI."""
    try:
        names = [str(m.get("model")) for m in list_models_response().get("models", []) if m.get("model")]
        if is_remote_mode():
            if sort_credentials_managed():
                return names
            return _merge_remote_and_local_vision(names, _local_model_names())
        return names
    except Exception:
        if is_remote_mode():
            if sort_credentials_managed():
                return []
            return _merge_remote_and_local_vision([], _local_model_names())
        return []


def _http_get(url: str, *, headers: dict[str, str], timeout: float) -> httpx.Response:
    """GET with short retries for flaky DNS / transient connect failures."""
    attempts = max(1, min(5, _env_int("OLLAMA_HEALTH_RETRIES", 3)))
    last_exc: Exception | None = None
    for attempt in range(attempts):
        try:
            with httpx.Client(timeout=timeout) as client:
                return client.get(url, headers=headers)
        except (httpx.ConnectError, httpx.NetworkError) as exc:
            last_exc = exc
            if attempt < attempts - 1:
                delay = 0.35 * (attempt + 1) + random.uniform(0, 0.15)
                time.sleep(delay)
    assert last_exc is not None
    raise last_exc


def health_check() -> dict[str, Any]:
    """
    Probe inference availability for ``GET /ready``.

    @returns ``{ok, mode, detail}``
    """
    mode = "remote" if is_remote_mode() else "local"
    timeout = min(_request_timeout_s(), 5.0)
    base = ollama_host()
    try:
        if is_remote_mode():
            path = "/health/liveliness"
            response = _http_get(f"{base}{path}", headers=_openai_headers(), timeout=timeout)
            ok = response.status_code == 200
            if not ok and _api_key():
                response = _http_get(f"{base}/v1/models", headers=_openai_headers(), timeout=timeout)
                ok = response.status_code == 200
            return {"ok": ok, "mode": mode, "detail": "reachable" if ok else f"status_{response.status_code}"}

        response = _http_get(f"{base}/api/tags", headers={}, timeout=timeout)
        ok = response.status_code == 200
        return {"ok": ok, "mode": mode, "detail": "reachable" if ok else f"status_{response.status_code}"}
    except Exception as exc:
        return {"ok": False, "mode": mode, "detail": type(exc).__name__}


def require_local_admin() -> None:
    """Guard pull/delete/prune routes that only apply to local ``ollama serve``."""
    if is_remote_mode():
        raise RemoteOllamaError(
            "Model install and storage management are disabled in cloud LLM mode. "
            "Embedding and chat models are provisioned on the Exo VPS — see docs/CLOUD_LLM_ONLY.md."
        )
