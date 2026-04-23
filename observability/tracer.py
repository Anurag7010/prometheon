"""
observability/tracer.py

Tracer context manager and decorator for timing and logging pipeline events.

Usage as context manager:
    with Tracer("retrieval", trace_id=tid) as t:
        docs = retrieve(query)
    # logs: {event, trace_id, latency_ms, status}

Usage as decorator:
    @tracer("llm_call")
    def call_something(): ...

Usage standalone:
    trace_id = new_trace_id()
"""

import functools
import time
import uuid
from typing import Any, Callable

from observability.logger import get_logger, log_pipeline_event

logger = get_logger(__name__)


def new_trace_id() -> str:
    """Generate and return a fresh UUID4 trace ID string."""
    return str(uuid.uuid4())


class Tracer:
    """
    Context manager that times a named event and logs structured output on exit.

    Attributes set after __exit__:
        latency_ms (float): Wall-clock duration of the traced block.
        status     (str):   "ok" or "error".
        error      (str):   Exception message if an error occurred, else None.
    """

    def __init__(self, event_name: str, trace_id: str | None = None) -> None:
        """Initialise tracer for event_name, generating trace_id if not supplied."""
        self.event_name: str        = event_name
        self.trace_id:   str        = trace_id or new_trace_id()
        self.latency_ms: float      = 0.0
        self.status:     str        = "ok"
        self.error:      str | None = None
        self._t0:        float      = 0.0

    def __enter__(self) -> "Tracer":
        """Start timing and return self so callers can access trace_id inside the block."""
        self._t0 = time.perf_counter()
        log_pipeline_event(
            event=f"{self.event_name}_start",
            trace_id=self.trace_id,
            metadata={},
        )
        return self

    def __exit__(
        self,
        exc_type: type | None,
        exc_val:  BaseException | None,
        exc_tb:   Any,
    ) -> bool:
        """Stop timing, log completion or error, and suppress nothing."""
        self.latency_ms = (time.perf_counter() - self._t0) * 1000

        if exc_val is not None:
            self.status = "error"
            self.error  = str(exc_val)

        log_pipeline_event(
            event=f"{self.event_name}_end",
            trace_id=self.trace_id,
            metadata={
                "latency_ms": round(self.latency_ms, 2),
                "status":     self.status,
                "error":      self.error,
            },
        )
        return False  # Never suppress exceptions


def tracer(event_name: str, trace_id: str | None = None) -> Callable:
    """
    Decorator factory that wraps a function in a Tracer context.

    Usage:
        @tracer("my_event")
        def do_something(): ...
    """
    def decorator(fn: Callable) -> Callable:
        @functools.wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            with Tracer(event_name, trace_id=trace_id):
                return fn(*args, **kwargs)
        return wrapper
    return decorator