"""Shared constants for the backend — single source of truth for all magic values."""

import os
import pathlib


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or str(raw).strip() == "":
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or str(raw).strip() == "":
        return default
    try:
        v = int(raw.strip(), 10)
        return default if v < 1 else v
    except ValueError:
        return default


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or str(raw).strip() == "":
        return default
    return str(raw).lower() in ("1", "true", "yes", "on")

# ── Networking ────────────────────────────────────────────────────────────────
BACKEND_PORT = 7799

# ── App state directory ───────────────────────────────────────────────────────
APP_STATE_DIR = pathlib.Path.home() / ".ai-file-sorter"

# ── Default AI model / language ───────────────────────────────────────────────
DEFAULT_OLLAMA_MODEL = "mistral"
DEFAULT_JOB_LANGUAGE = "English"

# ── Branding / default paths (aligned with frontend ``defaultSortOutputPathForBackend``) ─
APP_DISPLAY_NAME = "Exo"
# Expand with Path(...).expanduser() before filesystem use.
DEFAULT_SORT_OUTPUT_PATH_FOR_BACKEND = f"~/Documents/{APP_DISPLAY_NAME} Sorted Files"

# ── File organisation ─────────────────────────────────────────────────────────
UNCERTAIN_FOLDER = "Uncertain"
# Files with extraction quality below EXTRACTION_UNCERTAIN_QUALITY (no escape hatches) file here instead of Uncertain.
EMPTY_FOLDER = "Empty"
CONFIDENCE_THRESHOLD = 0.58

# Server-side safety ceiling on Drive file paths accepted into a single streaming job.
# The client's own listing cap (``WORKSPACE_CLOUD_RECURSE_MAX_FILES`` in ``frontend/src/constants.ts``
# and ``electron/integrations/workspaceRecurseCaps.js``) is the effective guardrail;
# this backend constant is a last-resort overflow defence that should never be hit in practice.
DRIVE_STREAM_PATH_CAP = 50_000

# ── Job store ─────────────────────────────────────────────────────────────────
JOB_SAVE_DEBOUNCE_SECONDS = 0.25

# ── Video extraction (sort pipeline): ffmpeg required for decode; STT optional ─
# Extensions routed in ``ingestor.extract_content`` to ``video_extract.extract_video_for_filing``.
VIDEO_FILE_EXTENSIONS: frozenset[str] = frozenset({".mp4", ".mov", ".m4v", ".webm", ".mkv"})
# Refuse to seek/transcode beyond this nominal duration (seconds).
VIDEO_MAX_DURATION_SEC = _env_int("EXOSITES_VIDEO_MAX_DURATION_SEC", 600)
# Window from t=0 for speech-to-text (seconds); also caps ffmpeg audio extract.
VIDEO_MAX_EXTRACT_SEC = _env_int("EXOSITES_VIDEO_MAX_EXTRACT_SEC", 120)
# Still frames passed to the vision model (spread across the capped timeline).
VIDEO_FRAME_COUNT = _env_int("EXOSITES_VIDEO_FRAME_COUNT", 3)
# Cap transcript length before merging into ``MAX_CHARS`` body.
VIDEO_MAX_TRANSCRIPT_CHARS = _env_int("EXOSITES_VIDEO_MAX_TRANSCRIPT_CHARS", 4000)
# Subprocess timeouts (seconds).
VIDEO_FFPROBE_TIMEOUT_SEC = _env_int("EXOSITES_VIDEO_FFPROBE_TIMEOUT_SEC", 60)
VIDEO_FFMPEG_TIMEOUT_SEC = _env_int("EXOSITES_VIDEO_FFMPEG_TIMEOUT_SEC", 180)
# Optional local STT (``pip install -r backend/requirements-video.txt``).
VIDEO_STT_ENABLE = _env_bool("EXOSITES_VIDEO_STT_ENABLE", False)
# Emit per-video extraction and gating diagnostics to backend logs.
VIDEO_DEBUG_LOG = _env_bool("EXOSITES_VIDEO_DEBUG_LOG", False)
# Include QuickTime/author tag in merged filing text (can be PII; default off).
VIDEO_METADATA_INCLUDE_AUTHOR = _env_bool("EXOSITES_VIDEO_METADATA_INCLUDE_AUTHOR", False)

# Whisper / faster-whisper (read in ``video_extract``; strings default when unset).
def _env_str(name: str, default: str) -> str:
    raw = os.environ.get(name)
    if raw is None:
        return default
    s = str(raw).strip()
    return s if s else default


VIDEO_STT_MODEL = _env_str("EXOSITES_VIDEO_STT_MODEL", "base")
VIDEO_STT_DEVICE = _env_str("EXOSITES_VIDEO_STT_DEVICE", "cpu")
VIDEO_STT_COMPUTE_TYPE = _env_str("EXOSITES_VIDEO_STT_COMPUTE_TYPE", "int8")
# ``None`` = auto-detect language in faster-whisper.
_stl = os.environ.get("EXOSITES_VIDEO_STT_LANGUAGE")
VIDEO_STT_LANGUAGE = _stl.strip() if isinstance(_stl, str) and _stl.strip() else None

# ── Spreadsheet preview (ingestor ``_extract_spreadsheet``) ─────────────────
SPREADSHEET_PREVIEW_MAX_ROWS = _env_int("EXOSITES_SPREADSHEET_PREVIEW_MAX_ROWS", 50)
SPREADSHEET_PREVIEW_MAX_SHEETS = _env_int("EXOSITES_SPREADSHEET_PREVIEW_MAX_SHEETS", 3)

# ── Text extraction limits ────────────────────────────────────────────────────
MAX_CHARS = 2000
MAX_TEXT_EXCERPT = 1800
OCR_PAGE_LIMIT = 6
# Max Tesseract language packs joined per page (auto / script paths). Higher = broader multilingual OCR, slower runs.
OCR_MAX_JOIN_LANGS = _env_int("OCR_MAX_JOIN_LANGS", 48)

# ── Classification ────────────────────────────────────────────────────────────
MAX_CANDIDATES = _env_int("MAX_CANDIDATES", 8)
MAX_CONTEXT_FOLDERS = 18
# When True and rerank winner != LLM JSON folder, min_confidence gate uses min(llm_conf, rerank_top).
CONFIDENCE_GATE_MIN_WHEN_DISAGREE = _env_bool("CONFIDENCE_GATE_MIN_WHEN_DISAGREE", False)

# ── Quality thresholds ────────────────────────────────────────────────────────
EXTRACTION_LOW_QUALITY_FLOOR = _env_float("EXTRACTION_LOW_QUALITY_FLOOR", 0.2)  # cap when signal weak
# Default 0.28: 0.35 was overly conservative for video/image/tabular previews that are useful but short on unique words.
EXTRACTION_UNCERTAIN_QUALITY = _env_float("EXTRACTION_UNCERTAIN_QUALITY", 0.28)  # below → Uncertain
NEW_FOLDER_MIN_QUALITY = _env_float("NEW_FOLDER_MIN_QUALITY", 0.6)  # block new folder if below
# Top-1 vs top-2 rerank score gap below this → Uncertain. Default 0.08: 0.12 was too loose vs clustered overlap scores.
CANDIDATE_MARGIN_THRESHOLD = _env_float("CANDIDATE_MARGIN_THRESHOLD", 0.08)
# Rerank: extra weight on filename-only overlap when the model or lexical signal is ambiguous (see classifier_scoring).
FILENAME_EMPHASIS_LLM_TRIGGER = _env_float("FILENAME_EMPHASIS_LLM_TRIGGER", 0.68)
FILENAME_EMPHASIS_STRENGTH = _env_float("FILENAME_EMPHASIS_STRENGTH", 0.55)
# Rerank scores below this are treated as too weak to override a high-confidence LLM pick (disagreement + ambiguous tie-break).
RERANK_WEAK_FLOOR = _env_float("RERANK_WEAK_FLOOR", 0.28)
LLM_TRUST_FOR_WEAK_RERANK = _env_float("LLM_TRUST_FOR_WEAK_RERANK", 0.84)
# When top-2 rerank scores are tied but lexical scores are strong, still prefer the LLM folder if confident.
AMBIGUOUS_FOLDER_FALLBACK_LLM = _env_bool("AMBIGUOUS_FOLDER_FALLBACK_LLM", True)
# Added to rerank score for the LLM's folder_name so margin reflects model choice vs pure token overlap.
LLM_CANDIDATE_AGREEMENT_BOOST = _env_float("LLM_CANDIDATE_AGREEMENT_BOOST", 0.12)
# Below min → no agreement boost (weak OCR should not let the LLM pick swamp lexical scores).
# At or above full → full boost. Linear ramp between (generic signal-strength gate, not locale-specific).
LLM_AGREEMENT_BOOST_MIN_QUALITY = _env_float("LLM_AGREEMENT_BOOST_MIN_QUALITY", 0.24)
LLM_AGREEMENT_BOOST_FULL_QUALITY = _env_float("LLM_AGREEMENT_BOOST_FULL_QUALITY", 0.42)
# When LLM confidence exceeds rerank by this much and rerank is weak, force review (confident hallucination).
LLM_RERANK_GAP_UNCERTAIN = _env_float("LLM_RERANK_GAP_UNCERTAIN", 0.35)
# Block auto-file when folder country/region contradicts explicit document geography cues.
GEO_FOLDER_GATE_ENABLE = _env_bool("GEO_FOLDER_GATE_ENABLE", True)
LOW_SIGNAL_QUALITY_SCORE = 0.05         # quality score for _low_signal extraction paths
PAUSE_POLL_SECONDS = 0.3                # sleep interval in honor_controls loop
EXTRACTION_EXCERPT_MAX_CHARS = 800      # text[:N] slice used for analysis

# Append one NDJSON line per classified file under APP_STATE_DIR/classify_debug.ndjson (dev/diagnostics).
CLASSIFY_DEBUG_LOG = _env_bool("CLASSIFY_DEBUG_LOG", False)

# Append job pipeline errors (analyze/apply) to APP_STATE_DIR/job_pipeline.ndjson when enabled.
JOB_PIPELINE_DEBUG_LOG = _env_bool("JOB_PIPELINE_DEBUG_LOG", False)

# Optional PDF vision supplement when OCR quality is middling (see ingestor).
PDF_VISION_SUPPLEMENT_ENABLE = _env_bool("PDF_VISION_SUPPLEMENT_ENABLE", False)
PDF_VISION_SUPPLEMENT_Q_MIN = _env_float("PDF_VISION_SUPPLEMENT_Q_MIN", 0.22)
PDF_VISION_SUPPLEMENT_Q_MAX = _env_float("PDF_VISION_SUPPLEMENT_Q_MAX", 0.55)

# Optional semantic rerank over folder labels (VPS embeddings via LiteLLM); on by default.
SEMANTIC_RERANK = _env_bool("SEMANTIC_RERANK", True)
SEMANTIC_RERANK_MODEL = os.environ.get("SEMANTIC_RERANK_MODEL", "nomic-embed-text").strip() or "nomic-embed-text"
SEMANTIC_RERANK_LEXICAL_WEIGHT = _env_float("SEMANTIC_RERANK_LEXICAL_WEIGHT", 0.62)
SEMANTIC_RERANK_SEMANTIC_WEIGHT = _env_float("SEMANTIC_RERANK_SEMANTIC_WEIGHT", 0.38)
# Preferred OCR packs when job does not specify ``tesseract_langs`` (installed subset used).
DEFAULT_OCR_LANG_PRIORITIES: tuple[str, ...] = ("eng", "ara")

# Post-extract filing briefing (second LLM call) for holistic classify + semantic query.
DOCUMENT_BRIEFING_ENABLE = _env_bool("DOCUMENT_BRIEFING_ENABLE", True)

# Skip briefing for short high-quality plaintext extracts (one fewer LLM round on obvious .txt paths).
DOCUMENT_BRIEFING_SKIP_SMALL_TEXT_ENABLE = _env_bool("DOCUMENT_BRIEFING_SKIP_SMALL_TEXT_ENABLE", True)
# Plaintext cap for generic .txt (attachments, local files). Gmail bodies use the larger cap below.
BRIEFING_SKIP_MAX_TEXT_CHARS = _env_int("BRIEFING_SKIP_MAX_TEXT_CHARS", 10_000)
# Gmail-exported message body .txt often includes headers and exceeds 2400 chars; skipping briefing there saves one LLM round per mail.
BRIEFING_SKIP_GMAIL_MESSAGE_MAX_TEXT_CHARS = _env_int("BRIEFING_SKIP_GMAIL_MESSAGE_MAX_TEXT_CHARS", 24_000)
BRIEFING_SKIP_MIN_QUALITY = _env_float("BRIEFING_SKIP_MIN_QUALITY", 0.42)

# Analyze worker: concurrent classify tasks for batch jobs (``analyze_files`` only). Gmail/Drive streams stay sequential.
_EXOSITES_SORT_MAX_CONCURRENCY_RAW = _env_int("EXOSITES_SORT_MAX_CONCURRENCY", 1)
EXOSITES_SORT_MAX_CONCURRENCY = max(1, min(8, _EXOSITES_SORT_MAX_CONCURRENCY_RAW))

# Log per-file phase timings (extract / briefing / classify vs wall). Debug = every row; slow = INFO when wall time exceeds threshold.
EXOSITES_ANALYZE_PHASE_TIMING_DEBUG_LOG = _env_bool("EXOSITES_ANALYZE_PHASE_TIMING_DEBUG_LOG", False)
# Milliseconds; 0 disables slow-row INFO logs. Default 30s surfaces stuck rows without enabling full debug.
EXOSITES_ANALYZE_PHASE_SLOW_LOG_MS = _env_float("EXOSITES_ANALYZE_PHASE_SLOW_LOG_MS", 30_000.0)

# When top-1 vs top-2 margin is below this, run a focused LLM pick among top-K candidates (after lexical + semantic).
# Extra LLM call when top candidates are nearly tied; enable with JUDGE_TOP_K_ENABLE=1 if latency is acceptable.
JUDGE_TOP_K_ENABLE = _env_bool("JUDGE_TOP_K_ENABLE", False)
JUDGE_MARGIN_THRESHOLD = _env_float("JUDGE_MARGIN_THRESHOLD", 0.07)
JUDGE_TOP_K = _env_int("JUDGE_TOP_K", 5)

# Run narrow two-folder LLM tie-break when margin is tight.
# Default off: lexical rerank top-1 is already the primary signal; the second LLM call adds latency
# for a small quality gain on near-tie cases. Enable with OLLAMA_AUTO_NARROW_TIE=1 if needed.
OLLAMA_AUTO_NARROW_TIE = _env_bool("OLLAMA_AUTO_NARROW_TIE", False)
# Rerank top-1 vs top-2 score gap below this triggers an extra narrow LLM call. Lower = fewer calls (faster); default was 0.12 in code (many borderline rows paid 2× classify latency).
OLLAMA_NARROW_MARGIN = _env_float("OLLAMA_NARROW_MARGIN", 0.06)

# PDF OCR quality at or below this triggers an extra vision pass with a filing-oriented prompt (when vision_model set).
PDF_VISION_FILING_LOW_Q = _env_float("PDF_VISION_FILING_LOW_Q", 0.38)

# Image extraction: run vision alongside OCR (hybrid merge) when a vision model is available.
IMAGE_VISION_ENABLE = _env_bool("IMAGE_VISION_ENABLE", True)
IMAGE_VISION_ALWAYS = _env_bool("IMAGE_VISION_ALWAYS", True)
# Structured JSON vision pass on degraded scans (extra vision call when confidence below trigger).
STRUCTURED_VISION_ENABLE = _env_bool("EXOSITES_STRUCTURED_VISION_ENABLE", False)
STRUCTURED_VISION_STRUCTURE_JOBS = _env_bool("EXOSITES_STRUCTURED_VISION_STRUCTURE_JOBS", True)
STRUCTURED_VISION_TRIGGER = _env_float("EXOSITES_STRUCTURED_VISION_TRIGGER", 0.45)
STRUCTURED_VISION_MIN_CONFIDENCE = _env_float("EXOSITES_STRUCTURED_VISION_MIN_CONFIDENCE", 0.6)
# One LLM reconcile call per structure-template job (cross-file property/country merge).
STRUCTURE_BATCH_RECONCILE_ENABLE = _env_bool("EXOSITES_STRUCTURE_BATCH_RECONCILE_ENABLE", True)
STRUCTURE_BATCH_RECONCILE_MIN_FILES = _env_int("EXOSITES_STRUCTURE_BATCH_RECONCILE_MIN_FILES", 3)
STRUCTURE_BATCH_RECONCILE_MIN_LOW_CONF = _env_float("EXOSITES_STRUCTURE_BATCH_RECONCILE_MIN_LOW_CONF", 0.72)
# Briefing trust floor — skip briefing below unless [Visual] section present (see document_briefing).
BRIEFING_MIN_QUALITY = _env_float("BRIEFING_MIN_QUALITY", 0.22)
# Gates: vision-backed excerpts treated as sufficient for new-folder / weak-body escapes.
VISION_BACKED_QUALITY_FLOOR = _env_float("VISION_BACKED_QUALITY_FLOOR", 0.35)
# Filter connector staging paths from classify folder lists.
FOLDER_CATALOG_FILTER_ENABLE = _env_bool("FOLDER_CATALOG_FILTER_ENABLE", True)

# When rerank margin is extremely tight, cap displayed confidence before min_confidence gate.
MARGIN_CONFIDENCE_GATE = _env_float("MARGIN_CONFIDENCE_GATE", 0.06)
CONFIDENCE_CAP_WHEN_TIGHT_MARGIN = _env_float("CONFIDENCE_CAP_WHEN_TIGHT_MARGIN", 0.52)

# ── Ollama chat options ───────────────────────────────────────────────────────
OLLAMA_CHAT_OPTIONS: dict = {"temperature": 0.1}

# ── Path expansion ────────────────────────────────────────────────────────────
DEFAULT_MAX_FILES = 5000
# Gmail “max messages” upper bound for API + UI (``Number.MAX_SAFE_INTEGER`` — no practical mailbox exceeds this).
# Lower with ``GMAIL_EXPORT_MAX_MESSAGES`` if a proxy or client cannot handle large integers.
_GMAIL_EXPORT_MAX_MESSAGES_DEFAULT = 9_007_199_254_740_991
GMAIL_EXPORT_MAX_MESSAGES = _env_int("GMAIL_EXPORT_MAX_MESSAGES", _GMAIL_EXPORT_MAX_MESSAGES_DEFAULT)
GMAIL_EXPORT_MAX_STAGING_BYTES = _env_int("GMAIL_EXPORT_MAX_STAGING_BYTES", 1 << 40)  # 1 TiB
GMAIL_EXPORT_MAX_ATTACHMENTS_PER_MESSAGE = _env_int("GMAIL_EXPORT_MAX_ATTACHMENTS_PER_MESSAGE", 10_000)
GMAIL_EXPORT_MAX_BYTES_PER_ATTACHMENT = _env_int("GMAIL_EXPORT_MAX_BYTES_PER_ATTACHMENT", 2 * 1024 * 1024 * 1024)  # 2 GiB
# Parallel Gmail ``users.messages.get`` + staging writes: batch size and bounded queue ahead of the iterator.
GMAIL_MESSAGE_FETCH_BATCH_SIZE = _env_int("GMAIL_MESSAGE_FETCH_BATCH_SIZE", 10)
GMAIL_MESSAGE_PREFETCH_QUEUE_MAX = _env_int("GMAIL_MESSAGE_PREFETCH_QUEUE_MAX", 32)
# Safety cap for preflight exact ``messages.list`` page walk (``maxResults=500`` per page).
GMAIL_EXACT_LIST_COUNT_MAX_PAGES = _env_int("GMAIL_EXACT_LIST_COUNT_MAX_PAGES", 20_000)
