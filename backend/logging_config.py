"""
Logging configuration for the AI Manager backend.

Call ``setup_logging()`` once at application startup (before any routers are
mounted).  Behaviour is controlled entirely through the ``LOG_LEVEL`` env var:

    LOG_LEVEL=DEBUG   — verbose per-step traces for every tool action
    LOG_LEVEL=INFO    — tool lifecycle + warnings (default)
    LOG_LEVEL=WARNING — only problems

Third-party noise (uvicorn access, httpx) is kept at WARNING regardless of the
root level so it does not drown out application logs.
"""

from __future__ import annotations

import logging
import logging.config
import os


def setup_logging() -> None:
    """Configure the root logger from the LOG_LEVEL environment variable."""
    level_name = os.environ.get("LOG_LEVEL", "INFO").upper()
    if level_name not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
        level_name = "INFO"

    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "default": {
                    "format": "%(asctime)s [%(levelname)-8s] %(name)s: %(message)s",
                    "datefmt": "%H:%M:%S",
                }
            },
            "handlers": {
                "console": {
                    "class": "logging.StreamHandler",
                    "formatter": "default",
                    "stream": "ext://sys.stderr",
                }
            },
            "root": {
                "handlers": ["console"],
                "level": level_name,
            },
            # Keep third-party libraries quiet unless explicitly raised.
            "loggers": {
                "uvicorn": {"level": "WARNING", "propagate": True},
                "uvicorn.access": {"level": "WARNING", "propagate": False},
                "uvicorn.error": {"level": "WARNING", "propagate": True},
                "httpx": {"level": "WARNING", "propagate": True},
                "httpcore": {"level": "WARNING", "propagate": True},
                "google": {"level": "WARNING", "propagate": True},
                "multipart": {"level": "WARNING", "propagate": True},
            },
        }
    )

    logging.getLogger(__name__).debug(
        "Logging initialised at level=%s", level_name
    )
