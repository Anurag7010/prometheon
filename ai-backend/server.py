"""
server.py

HTTP server entry point. Starts the FastAPI application via uvicorn.

Usage:
    python server.py                          # starts on port 8000
    API_PORT=9000 python server.py            # custom port
    uvicorn api.app:app --reload --port 8000  # direct uvicorn (alternative)

main.py remains the CLI entry point for health checks, smoke tests, and eval runs.
"""

import os
import uvicorn
from api.app import app  # noqa: F401 — imported so uvicorn can find it
from core.production_config import get_config

if __name__ == "__main__":
    cfg = get_config()
    port = int(os.getenv("API_PORT", "8000"))

    uvicorn.run(
        "api.app:app",
        host="0.0.0.0",
        port=port,
        reload=cfg.UVICORN_RELOAD,
        log_level=cfg.LOG_LEVEL.lower(),
    )
