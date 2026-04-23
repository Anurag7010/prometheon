"""
observability/logger.py

Structured logger for the entire AI backend.
All modules use get_logger(__name__) — never print() or raw logging.
Outputs one JSON object per line to stdout.

Specialised log helpers:
    log_llm_call(...)        — LLM call telemetry
    log_retrieval(...)       — RAG retrieval telemetry
    log_pipeline_event(...)  — Generic pipeline lifecycle events
"""

import json
import logging
import sys
import traceback
from datetime import datetime, timezone


# ── JSON formatter ────────────────────────────────────────────────────────────

class _JSONFormatter(logging.Formatter):
    """Formats each log record as a single JSON line parseable by any log aggregator."""

    _STANDARD_ATTRS: frozenset[str] = frozenset({
        "name", "msg", "args", "levelname", "levelno", "pathname",
        "filename", "module", "exc_info", "exc_text", "stack_info",
        "lineno", "funcName", "created", "msecs", "relativeCreated",
        "thread", "threadName", "processName", "process", "message",
        "taskName",
    })

    def format(self, record: logging.LogRecord) -> str:
        """Serialise a LogRecord to a JSON string."""
        payload: dict = {
            "time":   datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
            "level":  record.levelname,
            "module": record.name,
            "msg":    record.getMessage(),
        }
        if record.exc_info:
            payload["exception"] = "".join(
                traceback.format_exception(*record.exc_info)
            ).strip()

        # Merge any extra= fields the caller supplied
        for key, val in record.__dict__.items():
            if key not in self._STANDARD_ATTRS:
                payload[key] = val

        return json.dumps(payload, default=str)


# ── Logger factory ────────────────────────────────────────────────────────────

def get_logger(name: str) -> logging.Logger:
    """Return a named JSON logger configured from config.LOG_LEVEL."""
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    from core.config import config
    level = getattr(logging, config.LOG_LEVEL.upper(), logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)
    handler.setFormatter(_JSONFormatter())

    logger.setLevel(level)
    logger.addHandler(handler)
    logger.propagate = False
    return logger


# ── Module-level logger for helper functions ──────────────────────────────────
_log = get_logger("observability")


# ── Specialised log helpers ───────────────────────────────────────────────────

def log_llm_call(
    *,
    trace_id:      str,
    model:         str,
    input_tokens:  int,
    output_tokens: int,
    latency_ms:    float,
    cost_usd:      float,
    error:         str | None = None,
) -> None:
    """Log structured telemetry for a single LLM API call."""
    _log.info(
        "llm_call",
        extra={
            "trace_id":      trace_id,
            "model":         model,
            "input_tokens":  input_tokens,
            "output_tokens": output_tokens,
            "latency_ms":    round(latency_ms, 2),
            "cost_usd":      round(cost_usd, 6),
            "error":         error,
        },
    )


def log_retrieval(
    *,
    trace_id:    str,
    query:       str,
    strategy:    str,
    top_k:       int,
    result_count: int,
    latency_ms:  float,
    error:       str | None = None,
) -> None:
    """Log structured telemetry for a RAG retrieval call."""
    _log.info(
        "retrieval",
        extra={
            "trace_id":     trace_id,
            "query":        query[:120],   # truncate long queries in logs
            "strategy":     strategy,
            "top_k":        top_k,
            "result_count": result_count,
            "latency_ms":   round(latency_ms, 2),
            "error":        error,
        },
    )


def log_pipeline_event(
    *,
    event:    str,
    trace_id: str,
    metadata: dict,
) -> None:
    """Log a generic pipeline lifecycle event (start, end, checkpoints)."""
    _log.info(
        event,
        extra={"trace_id": trace_id, **metadata},
    )