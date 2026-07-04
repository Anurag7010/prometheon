"""
api/app.py

FastAPI application: CORS, trace_id middleware, exception handlers, startup/shutdown.

This is the ASGI entry point — separate from main.py (CLI entry point).
Uvicorn hosts this object; main.py stays as the script entry point for health checks
and smoke tests.
"""

import os as _os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.models import ErrorResponse
from observability.logger import get_logger

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    """Manage application startup and shutdown."""
    logger.info("api_startup", extra={"status": "started", "port": int(_os.getenv("API_PORT", "8001"))})
    yield
    logger.info("api_shutdown", extra={"status": "shutting_down"})


app = FastAPI(
    title="AI Backend API",
    description="RAG-powered question answering API for the AI product",
    version="1.0.0",
    lifespan=lifespan,
)


# ── CORS ──────────────────────────────────────────────────────────────────────
# Origins come from production_config: localhost in development, FRONTEND_URL
# in production (get_config raises if FRONTEND_URL is unset). Never "*".

from core.production_config import get_config  # noqa: E402

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_config().CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)


# ── API key middleware ────────────────────────────────────────────────────────
# All routes except /health require X-API-Key from the Next.js proxy.
# /health is excluded — load balancers call it without credentials.
# Reads trace_id from the header directly (state not yet populated at this point).


@app.middleware("http")
async def api_key_middleware(request: Request, call_next):
    """Reject requests without a valid X-API-Key header (except /health)."""
    if request.url.path == "/health":
        return await call_next(request)

    from core.config import config as _config

    expected_key = _config.INTERNAL_API_KEY
    provided_key = request.headers.get("X-API-Key")

    if not provided_key or provided_key != expected_key:
        trace_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        body = ErrorResponse(
            error="unauthorized",
            message="Missing or invalid X-API-Key header",
            trace_id=trace_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )
        return JSONResponse(status_code=401, content=body.model_dump())

    return await call_next(request)


# ── Trace ID middleware ────────────────────────────────────────────────────────
# Extracts X-Request-ID from incoming headers (set by Next.js proxy).
# Generates a fresh UUID if absent. Attaches to request.state.trace_id.
# Echoes it back in the response header so the caller can correlate logs.


@app.middleware("http")
async def trace_id_middleware(request: Request, call_next):
    """Attach trace_id to every request for end-to-end observability correlation."""
    trace_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.trace_id = trace_id

    response = await call_next(request)
    response.headers["X-Request-ID"] = trace_id
    return response


# ── Exception handlers ────────────────────────────────────────────────────────
# Global handler: catches any unhandled exception, logs it, returns 500.
# Validation handler: catches Pydantic validation failures, returns 422.
# Neither leaks stack traces to the client — those stay in logs only.


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all for unhandled errors. Logs full traceback, returns 500."""
    trace_id = getattr(request.state, "trace_id", None)
    logger.error(
        "unhandled_exception",
        extra={"trace_id": trace_id, "error": str(exc), "path": str(request.url.path)},
        exc_info=True,
    )
    body = ErrorResponse(
        error="internal_server_error",
        message="An unexpected error occurred. Check server logs for details.",
        trace_id=trace_id,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
    return JSONResponse(status_code=500, content=body.model_dump())


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Pydantic validation failures. Returns field-level details with 422."""
    trace_id = getattr(request.state, "trace_id", None)
    field_errors = [
        {"field": ".".join(str(loc) for loc in e["loc"]), "message": e["msg"]} for e in exc.errors()
    ]
    logger.warning(
        "request_validation_error",
        extra={"trace_id": trace_id, "fields": field_errors, "path": str(request.url.path)},
    )
    body = ErrorResponse(
        error="validation_error",
        message=f"Request validation failed: {len(field_errors)} field error(s)",
        trace_id=trace_id,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
    return JSONResponse(
        status_code=422,
        content={**body.model_dump(), "fields": field_errors},
    )


# ── Router registration ───────────────────────────────────────────────────────
# Imported here (after app is created) to avoid circular imports.

from api.routes import router  # noqa: E402

app.include_router(router)
