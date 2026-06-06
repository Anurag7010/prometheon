"""
core/request_queue.py

Limits concurrent LLM calls using asyncio.Semaphore.

Prevents thundering herd: instead of N concurrent OpenAI calls triggering rate
limiting, at most MAX_CONCURRENT calls run at once with the rest waiting up to
QUEUE_TIMEOUT seconds before being rejected with a 503.
"""

import asyncio
from typing import Any, Callable, Optional

from observability.logger import log_pipeline_event


class RequestQueue:
    """Concurrency limiter for LLM calls via asyncio.Semaphore."""

    MAX_CONCURRENT = 10
    QUEUE_TIMEOUT = 30.0

    def __init__(self) -> None:
        self._semaphore = asyncio.Semaphore(self.MAX_CONCURRENT)
        self._queued = 0
        self._total_processed = 0
        self._total_timeouts = 0

    async def run(
        self,
        fn: Callable,
        *args: Any,
        trace_id: Optional[str] = None,
        **kwargs: Any,
    ) -> Any:
        """Run a function with concurrency control. Times out if queue wait is too long."""
        self._queued += 1
        queue_depth = self._queued

        log_pipeline_event(event='request_queued', trace_id=trace_id or '', metadata={'queue_depth': queue_depth})

        try:
            await asyncio.wait_for(
                self._semaphore.acquire(),
                timeout=self.QUEUE_TIMEOUT,
            )
        except asyncio.TimeoutError:
            self._queued -= 1
            self._total_timeouts += 1
            log_pipeline_event(
                event='request_queue_timeout',
                trace_id=trace_id or '',
                metadata={
                    'queue_depth': queue_depth,
                    'timeout_seconds': self.QUEUE_TIMEOUT,
                },
            )
            raise TimeoutError(
                f'Request waited {self.QUEUE_TIMEOUT}s in queue. '
                'Server is busy — please try again shortly.'
            )

        self._queued -= 1
        try:
            log_pipeline_event(event='request_dequeued', trace_id=trace_id or '', metadata={'queue_depth': self._queued})
            result = await fn(*args, **kwargs)
            self._total_processed += 1
            return result
        finally:
            self._semaphore.release()

    @property
    def stats(self) -> dict:
        """Return current queue stats for health monitoring."""
        return {
            'max_concurrent': self.MAX_CONCURRENT,
            'currently_queued': self._queued,
            'available_slots': self._semaphore._value,
            'total_processed': self._total_processed,
            'total_timeouts': self._total_timeouts,
            'queue_timeout_seconds': self.QUEUE_TIMEOUT,
        }


request_queue = RequestQueue()
