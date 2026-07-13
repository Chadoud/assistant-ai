"""
Entry point for the packaged backend binary (Windows .exe / macOS Mach-O).
Accepts --port argument so Electron can pass a custom port.
"""
import argparse

import uvicorn

from constants import BACKEND_PORT
from frozen_stdio import ensure_stdio_streams

if __name__ == "__main__":
    ensure_stdio_streams()

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=BACKEND_PORT)
    parser.add_argument("--host", type=str, default="127.0.0.1")
    args = parser.parse_args()

    uvicorn.run(
        "main:app",
        host=args.host,
        port=args.port,
        log_level="warning",
        access_log=False,
    )
