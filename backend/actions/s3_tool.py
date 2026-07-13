"""
Amazon S3 connector — list buckets/objects, get metadata, copy, and delete objects.

Credentials are loaded from the connector_credentials token cache using provider
ID "s3", or fall back to the standard AWS environment variables
(AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION) so the tool
works in both Electron (token relay) and server-only (env var) modes.

Note: S3 credentials are typically a static access key pair rather than an
OAuth access token. The "token" stored under "s3" in connector_credentials
should be a JSON string containing {"access_key_id": "...", "secret_key": "...",
"region": "...", "session_token": "..."} — or leave the provider disconnected
and rely on standard AWS env vars.

Operations:
  list_buckets, list_objects, get_object_metadata, copy_object, delete_object,
  create_folder (creates a zero-byte prefix key)
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import urllib.parse
from datetime import datetime, timezone
from typing import Any

import httpx

from connector_credentials import CredentialUnavailableError

logger = logging.getLogger(__name__)


# ── Credential resolution ─────────────────────────────────────────────────────

def _load_s3_creds() -> tuple[str, str, str, str | None]:
    """
    Return (access_key_id, secret_key, region, session_token).

    Resolution order:
      1. connector_credentials cache under "s3" (JSON-encoded dict)
      2. Standard AWS environment variables
    """
    # 1. Token relay (JSON blob)
    import time

    from connector_credentials import _ENV_PREFIX, _token_cache
    entry = _token_cache.get("s3")
    if entry and (entry.expires_at == 0.0 or time.monotonic() < entry.expires_at):
        try:
            data = json.loads(entry.token)
            return (
                data["access_key_id"],
                data["secret_key"],
                data.get("region", "us-east-1"),
                data.get("session_token"),
            )
        except (json.JSONDecodeError, KeyError):
            pass

    # 2. Env var CONNECTOR_TOKEN_S3 (also JSON)
    env_val = os.environ.get(f"{_ENV_PREFIX}S3", "").strip()
    if env_val:
        try:
            data = json.loads(env_val)
            return (
                data["access_key_id"],
                data["secret_key"],
                data.get("region", "us-east-1"),
                data.get("session_token"),
            )
        except (json.JSONDecodeError, KeyError):
            pass

    # 3. Standard AWS environment variables
    key_id = os.environ.get("AWS_ACCESS_KEY_ID", "").strip()
    secret = os.environ.get("AWS_SECRET_ACCESS_KEY", "").strip()
    region = os.environ.get("AWS_DEFAULT_REGION", "us-east-1").strip()
    token = os.environ.get("AWS_SESSION_TOKEN", "").strip() or None

    if key_id and secret:
        return key_id, secret, region, token

    raise CredentialUnavailableError(
        "No S3 credentials available. Connect the S3 account in Settings, set "
        "CONNECTOR_TOKEN_S3 as a JSON blob, or configure AWS_ACCESS_KEY_ID and "
        "AWS_SECRET_ACCESS_KEY environment variables."
    )


# ── AWS Signature Version 4 ───────────────────────────────────────────────────

def _sign_v4(
    method: str,
    url: str,
    headers: dict[str, str],
    payload: bytes,
    access_key: str,
    secret_key: str,
    region: str,
    service: str = "s3",
    session_token: str | None = None,
) -> dict[str, str]:
    """
    Add AWS Signature Version 4 Authorization and x-amz-date headers.
    Returns the updated headers dict.
    """
    now = datetime.now(timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")

    parsed = urllib.parse.urlparse(url)
    host = parsed.netloc
    path = parsed.path or "/"
    query_string = parsed.query

    headers = dict(headers)
    headers["x-amz-date"] = amz_date
    headers["host"] = host
    if session_token:
        headers["x-amz-security-token"] = session_token

    signed_headers = ";".join(sorted(k.lower() for k in headers))
    canonical_headers = "".join(
        f"{k.lower()}:{v.strip()}\n" for k, v in sorted(headers.items(), key=lambda x: x[0].lower())
    )

    payload_hash = hashlib.sha256(payload).hexdigest()
    canonical_request = "\n".join([
        method,
        path,
        query_string,
        canonical_headers,
        signed_headers,
        payload_hash,
    ])

    credential_scope = f"{date_stamp}/{region}/{service}/aws4_request"
    string_to_sign = "\n".join([
        "AWS4-HMAC-SHA256",
        amz_date,
        credential_scope,
        hashlib.sha256(canonical_request.encode()).hexdigest(),
    ])

    def _hmac(key: bytes, msg: str) -> bytes:
        return hmac.new(key, msg.encode(), hashlib.sha256).digest()

    signing_key = _hmac(
        _hmac(_hmac(_hmac(f"AWS4{secret_key}".encode(), date_stamp), region), service),
        "aws4_request",
    )
    signature = hmac.new(signing_key, string_to_sign.encode(), hashlib.sha256).hexdigest()

    headers["Authorization"] = (
        f"AWS4-HMAC-SHA256 Credential={access_key}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )
    return headers


def _s3_request(method: str, bucket: str | None, key: str | None, params: dict[str, str] | None = None) -> httpx.Response:
    access_key, secret_key, region, session_token = _load_s3_creds()
    endpoint = f"https://s3.{region}.amazonaws.com"

    path_parts: list[str] = []
    if bucket:
        path_parts.append(bucket)
    if key:
        path_parts.append(key.lstrip("/"))

    url = endpoint + "/" + "/".join(path_parts)
    if params:
        url += "?" + urllib.parse.urlencode(sorted(params.items()))

    headers = _sign_v4(method, url, {}, b"", access_key, secret_key, region, session_token=session_token)
    res = httpx.request(method, url, headers=headers, timeout=15)
    return res


# ── Operations ────────────────────────────────────────────────────────────────

def _list_buckets(_params: dict[str, Any]) -> dict[str, Any]:
    """List all S3 buckets owned by the authenticated account."""
    import xml.etree.ElementTree as ET

    res = _s3_request("GET", None, None)
    res.raise_for_status()
    root = ET.fromstring(res.text)
    ns = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}
    buckets = [
        {
            "name": b.findtext("s3:Name", namespaces=ns),
            "created": b.findtext("s3:CreationDate", namespaces=ns),
        }
        for b in root.findall(".//s3:Bucket", ns)
    ]
    return {"ok": True, "data": {"buckets": buckets, "count": len(buckets)}}


def _list_objects(params: dict[str, Any]) -> dict[str, Any]:
    """
    List objects in an S3 bucket.

    Args:
        bucket: S3 bucket name.
        prefix: Key prefix filter (simulates folder browsing).
        max_keys: Maximum objects to return (default 50, max 1000).
    """
    import xml.etree.ElementTree as ET

    bucket = str(params.get("bucket", "")).strip()
    prefix = str(params.get("prefix", "")).strip()
    max_keys = min(int(params.get("max_keys", 50)), 1000)

    if not bucket:
        return {"ok": False, "error": "bucket is required"}

    query: dict[str, str] = {"list-type": "2", "max-keys": str(max_keys)}
    if prefix:
        query["prefix"] = prefix

    res = _s3_request("GET", bucket, None, query)
    res.raise_for_status()

    ns = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}
    root = ET.fromstring(res.text)
    objects = [
        {
            "key": o.findtext("s3:Key", namespaces=ns),
            "size": int(o.findtext("s3:Size", "0", namespaces=ns) or 0),
            "last_modified": o.findtext("s3:LastModified", namespaces=ns),
        }
        for o in root.findall(".//s3:Contents", ns)
    ]
    return {"ok": True, "data": {"objects": objects, "count": len(objects), "bucket": bucket}}


def _get_object_metadata(params: dict[str, Any]) -> dict[str, Any]:
    """
    Get metadata (HEAD) for a specific S3 object.

    Args:
        bucket: S3 bucket name.
        key: Object key.
    """
    bucket = str(params.get("bucket", "")).strip()
    key = str(params.get("key", "")).strip()

    if not bucket or not key:
        return {"ok": False, "error": "bucket and key are required"}

    res = _s3_request("HEAD", bucket, key)
    res.raise_for_status()
    return {
        "ok": True,
        "data": {
            "bucket": bucket,
            "key": key,
            "content_type": res.headers.get("content-type"),
            "content_length": res.headers.get("content-length"),
            "last_modified": res.headers.get("last-modified"),
            "etag": res.headers.get("etag"),
        },
    }


def _copy_object(params: dict[str, Any]) -> dict[str, Any]:
    """
    Copy an S3 object to a new key (optionally in a different bucket).

    Args:
        source_bucket: Source bucket.
        source_key: Source object key.
        destination_bucket: Destination bucket.
        destination_key: Destination object key.
    """
    src_bucket = str(params.get("source_bucket", "")).strip()
    src_key = str(params.get("source_key", "")).strip()
    dst_bucket = str(params.get("destination_bucket", "")).strip()
    dst_key = str(params.get("destination_key", "")).strip()

    if not src_bucket or not src_key or not dst_bucket or not dst_key:
        return {"ok": False, "error": "source_bucket, source_key, destination_bucket, destination_key are all required"}

    access_key, secret_key, region, session_token = _load_s3_creds()
    endpoint = f"https://s3.{region}.amazonaws.com"
    url = f"{endpoint}/{dst_bucket}/{dst_key.lstrip('/')}"
    base_headers = {"x-amz-copy-source": f"/{src_bucket}/{src_key.lstrip('/')}"}
    headers = _sign_v4("PUT", url, base_headers, b"", access_key, secret_key, region, session_token=session_token)
    res = httpx.put(url, headers=headers, timeout=30)
    res.raise_for_status()
    return {"ok": True, "data": {"destination": f"{dst_bucket}/{dst_key}"}}


def _delete_object(params: dict[str, Any]) -> dict[str, Any]:
    """
    Delete an S3 object.

    Args:
        bucket: S3 bucket name.
        key: Object key to delete.
    """
    bucket = str(params.get("bucket", "")).strip()
    key = str(params.get("key", "")).strip()

    if not bucket or not key:
        return {"ok": False, "error": "bucket and key are required"}

    res = _s3_request("DELETE", bucket, key)
    if res.status_code not in (200, 204):
        res.raise_for_status()
    return {"ok": True, "data": {"deleted": f"{bucket}/{key}"}}


def _create_folder(params: dict[str, Any]) -> dict[str, Any]:
    """
    Create a virtual S3 folder by uploading a zero-byte object with a trailing slash.

    Args:
        bucket: S3 bucket name.
        prefix: Folder path (trailing slash added automatically).
    """
    bucket = str(params.get("bucket", "")).strip()
    prefix = str(params.get("prefix", "")).strip().rstrip("/") + "/"

    if not bucket or prefix == "/":
        return {"ok": False, "error": "bucket and prefix are required"}

    access_key, secret_key, region, session_token = _load_s3_creds()
    endpoint = f"https://s3.{region}.amazonaws.com"
    url = f"{endpoint}/{bucket}/{prefix}"
    headers = _sign_v4("PUT", url, {"content-length": "0"}, b"", access_key, secret_key, region, session_token=session_token)
    res = httpx.put(url, headers=headers, content=b"", timeout=10)
    res.raise_for_status()
    return {"ok": True, "data": {"created_prefix": f"{bucket}/{prefix}"}}


# ── Dispatcher ────────────────────────────────────────────────────────────────

_OPERATIONS: dict[str, Any] = {
    "list_buckets": _list_buckets,
    "list_objects": _list_objects,
    "get_object_metadata": _get_object_metadata,
    "copy_object": _copy_object,
    "delete_object": _delete_object,
    "create_folder": _create_folder,
}


def s3_storage(parameters: dict[str, Any]) -> dict[str, Any]:
    """
    Amazon S3 connector — buckets and objects.

    Parameters:
        operation: One of list_buckets | list_objects | get_object_metadata |
                   copy_object | delete_object | create_folder
        (operation-specific params): See individual operation docstrings above.
    """
    logger.debug("[action] s3_storage called args=%r", parameters)
    operation = str(parameters.get("operation", "")).strip()

    if not operation:
        return {
            "ok": False,
            "error": f"operation is required. Available: {sorted(_OPERATIONS)}",
        }

    handler = _OPERATIONS.get(operation)
    if handler is None:
        return {
            "ok": False,
            "error": f"Unknown operation {operation!r}. Available: {sorted(_OPERATIONS)}",
        }

    try:
        return handler(parameters)
    except CredentialUnavailableError as exc:
        logger.warning("[s3_storage] credential unavailable: %s", exc)
        return {"ok": False, "error": str(exc)}
    except httpx.HTTPStatusError as exc:
        logger.warning("[s3_storage] HTTP %s for %s", exc.response.status_code, exc.request.url)
        return {"ok": False, "error": f"S3 error {exc.response.status_code}: {exc.response.text[:300]}"}
    except Exception as exc:
        logger.exception("[s3_storage] unexpected error in operation=%r", operation)
        return {"ok": False, "error": str(exc)}
