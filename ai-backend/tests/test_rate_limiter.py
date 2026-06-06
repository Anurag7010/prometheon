"""Tests for core/rate_limiter.py."""

import time
from unittest.mock import patch

import pytest

from core.rate_limiter import SlidingWindowRateLimiter


def test_first_request_allowed():
    limiter = SlidingWindowRateLimiter(requests_per_window=5, window_seconds=60)
    result = limiter.check("user_a")
    assert result.allowed is True
    assert result.requests_in_window == 1
    assert result.retry_after is None


def test_requests_within_limit_all_allowed():
    limiter = SlidingWindowRateLimiter(requests_per_window=5, window_seconds=60)
    for i in range(5):
        result = limiter.check("user_b")
        assert result.allowed is True


def test_request_at_limit_plus_one_is_rejected():
    limiter = SlidingWindowRateLimiter(requests_per_window=3, window_seconds=60)
    for _ in range(3):
        limiter.check("user_c")
    result = limiter.check("user_c")
    assert result.allowed is False
    assert result.retry_after is not None
    assert isinstance(result.retry_after, int)
    assert result.retry_after > 0


def test_different_users_do_not_affect_each_other():
    limiter = SlidingWindowRateLimiter(requests_per_window=2, window_seconds=60)
    for _ in range(2):
        limiter.check("user_x")
    # user_x is at limit — user_y should still be allowed
    result = limiter.check("user_y")
    assert result.allowed is True


def test_after_window_expires_user_can_make_requests():
    limiter = SlidingWindowRateLimiter(requests_per_window=2, window_seconds=1)
    for _ in range(2):
        limiter.check("user_d")
    assert limiter.check("user_d").allowed is False

    # Mock time to simulate window expiry
    with patch("core.rate_limiter.time.time", return_value=time.time() + 2):
        result = limiter.check("user_d")
    assert result.allowed is True


def test_get_stats_returns_tracked_users_count():
    limiter = SlidingWindowRateLimiter(requests_per_window=10, window_seconds=60)
    limiter.check("alpha")
    limiter.check("beta")
    stats = limiter.get_stats()
    assert stats["tracked_users"] == 2
    assert stats["limit"] == 10
    assert stats["window_seconds"] == 60


def test_retry_after_is_positive_integer():
    limiter = SlidingWindowRateLimiter(requests_per_window=1, window_seconds=60)
    limiter.check("user_e")
    result = limiter.check("user_e")
    assert result.allowed is False
    assert isinstance(result.retry_after, int)
    assert result.retry_after >= 1
