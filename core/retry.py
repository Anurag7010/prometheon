"""
core/retry.py

Retry logic with exponential backoff for transient LLM API failures.
Used exclusively by llm_client.py — do not import in business logic.

Retryable errors: rate limits (429), server errors (500/502/503/504), timeouts.
Non-retryable errors: auth (401), bad request (400), context too long (400).
"""

import time
import functools
from typing import Callable, Type
from observability.logger import get_logger

logger = get_logger(__name__)

# Errors we consider transient and worth retrying
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


def with_retry(
    max_attempts: int = 3,
    base_delay: float = 1.0,
    backoff_factor: float = 2.0,
    retryable_exceptions: tuple[Type[Exception], ...] = (Exception,),
) -> Callable:
    """
    Decorator: retry a function with exponential backoff.

    Args:
        max_attempts:         Total number of attempts (including the first).
        base_delay:           Seconds to wait before the first retry.
        backoff_factor:       Multiplier applied to delay after each failure.
        retryable_exceptions: Exception types that trigger a retry.
                              Everything else propagates immediately.

    Usage:
        @with_retry(max_attempts=3, base_delay=1.0)
        def call_api(...): ...
    """
    def decorator(fn: Callable) -> Callable:
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            delay = base_delay
            last_exception: Exception | None = None

            for attempt in range(1, max_attempts + 1):
                try:
                    return fn(*args, **kwargs)

                except retryable_exceptions as exc:
                    last_exception = exc
                    is_last = attempt == max_attempts

                    # Check if this is a non-retryable HTTP status
                    status = getattr(exc, "status_code", None)
                    if status is not None and status not in RETRYABLE_STATUS_CODES:
                        logger.error(
                            f"[retry] Non-retryable error (HTTP {status}) in "
                            f"'{fn.__name__}' — propagating immediately."
                        )
                        raise

                    if is_last:
                        logger.error(
                            f"[retry] '{fn.__name__}' failed after {max_attempts} "
                            f"attempts. Final error: {exc}"
                        )
                        raise

                    logger.warning(
                        f"[retry] '{fn.__name__}' attempt {attempt}/{max_attempts} "
                        f"failed: {exc}. Retrying in {delay:.1f}s..."
                    )
                    time.sleep(delay)
                    delay *= backoff_factor

            # Should never reach here
            raise last_exception  # type: ignore

        return wrapper
    return decorator

