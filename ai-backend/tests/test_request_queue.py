"""Tests for core/request_queue.py."""

import asyncio
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

from core.request_queue import RequestQueue


@pytest.mark.asyncio
async def test_function_runs_and_returns_result():
    queue = RequestQueue()
    async def fn():
        return 42
    result = await queue.run(fn)
    assert result == 42


@pytest.mark.asyncio
async def test_concurrent_calls_up_to_max_all_run():
    queue = RequestQueue()
    results = []

    async def fn(value: int):
        results.append(value)
        return value

    tasks = [queue.run(fn, i) for i in range(queue.MAX_CONCURRENT)]
    await asyncio.gather(*tasks)
    assert len(results) == queue.MAX_CONCURRENT


@pytest.mark.asyncio
async def test_calls_beyond_max_wait_for_slot():
    queue = RequestQueue()
    started = []
    barrier = asyncio.Event()

    async def slow_fn(label: str):
        started.append(label)
        await barrier.wait()
        return label

    # Fill all slots
    tasks = [asyncio.create_task(queue.run(slow_fn, f"t{i}")) for i in range(queue.MAX_CONCURRENT)]
    await asyncio.sleep(0.05)  # let them acquire
    assert len(started) == queue.MAX_CONCURRENT

    # One more should queue
    extra = asyncio.create_task(queue.run(slow_fn, "extra"))
    await asyncio.sleep(0.02)
    assert "extra" not in started  # still waiting

    barrier.set()
    await asyncio.gather(*tasks, extra)
    assert "extra" in started


@pytest.mark.asyncio
async def test_timeout_raises_timeout_error():
    queue = RequestQueue()

    async def mock_acquire():
        raise asyncio.TimeoutError()

    with patch("asyncio.wait_for", side_effect=asyncio.TimeoutError()):
        with pytest.raises(TimeoutError, match="Server is busy"):
            await queue.run(AsyncMock())


@pytest.mark.asyncio
async def test_stats_currently_queued_decrements_after_completion():
    queue = RequestQueue()

    async def fn():
        return "done"

    await queue.run(fn)
    assert queue.stats["currently_queued"] == 0


@pytest.mark.asyncio
async def test_total_timeouts_increments_on_timeout():
    queue = RequestQueue()
    initial_timeouts = queue._total_timeouts

    with patch("asyncio.wait_for", side_effect=asyncio.TimeoutError()):
        try:
            await queue.run(AsyncMock())
        except TimeoutError:
            pass

    assert queue._total_timeouts == initial_timeouts + 1
