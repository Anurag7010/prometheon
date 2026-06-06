"""
core/rate_limiter.py

Per-user sliding window rate limiter.

NOTE: In-memory only — does not work across multiple server instances.
For multi-instance deployment, replace with a Redis-backed rate limiter.
"""

import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Optional

from observability.logger import log_pipeline_event


@dataclass
class RateLimitResult:
    """Result of a rate limit check."""
    allowed: bool
    user_id: str
    requests_in_window: int
    limit: int
    window_seconds: int
    retry_after: Optional[int]


class SlidingWindowRateLimiter:
    """
    Per-user sliding window rate limiter.

    Tracks request timestamps in a deque per user.
    On each request: remove timestamps older than window, count remaining.
    If count >= limit: reject with retry_after.
    """

    def __init__(self, requests_per_window: int = 20, window_seconds: int = 60):
        self.limit = requests_per_window
        self.window = window_seconds
        self._windows: dict[str, deque] = defaultdict(deque)

    def check(self, user_id: str, trace_id: str = None) -> RateLimitResult:
        """Check if a user is within their rate limit. Records the request if allowed."""
        now = time.time()
        window_start = now - self.window
        user_window = self._windows[user_id]

        while user_window and user_window[0] < window_start:
            user_window.popleft()

        count = len(user_window)

        if count >= self.limit:
            oldest = user_window[0]
            retry_after = int(oldest + self.window - now) + 1
            log_pipeline_event(
                event='rate_limit_exceeded',
                trace_id=trace_id or '',
                metadata={
                    'user_id': user_id,
                    'requests_in_window': count,
                    'limit': self.limit,
                    'retry_after': retry_after,
                },
            )
            return RateLimitResult(
                allowed=False,
                user_id=user_id,
                requests_in_window=count,
                limit=self.limit,
                window_seconds=self.window,
                retry_after=retry_after,
            )

        user_window.append(now)
        return RateLimitResult(
            allowed=True,
            user_id=user_id,
            requests_in_window=count + 1,
            limit=self.limit,
            window_seconds=self.window,
            retry_after=None,
        )

    def get_stats(self) -> dict:
        """Return current rate limiter state for health monitoring."""
        return {
            'tracked_users': len(self._windows),
            'limit': self.limit,
            'window_seconds': self.window,
            'users_near_limit': sum(
                1 for w in self._windows.values()
                if len(w) >= self.limit * 0.8
            ),
        }


ask_rate_limiter = SlidingWindowRateLimiter(requests_per_window=20, window_seconds=60)
ingest_rate_limiter = SlidingWindowRateLimiter(requests_per_window=5, window_seconds=60)
