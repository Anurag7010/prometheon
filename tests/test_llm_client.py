"""
tests/test_llm_client.py

Unit tests for core/llm_client.py and core/retry.py.
These tests mock the OpenAI API — no real calls, no cost.

Run with:  python -m pytest tests/test_llm_client.py -v
"""

import json
import pytest
from unittest.mock import MagicMock, patch
from pydantic import BaseModel

# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_mock_response(text: str, input_tokens: int = 10, output_tokens: int = 20):
    """Build a fake OpenAI ChatCompletion response object."""
    choice  = MagicMock()
    choice.message.content = text

    usage = MagicMock()
    usage.prompt_tokens     = input_tokens
    usage.completion_tokens = output_tokens

    response = MagicMock()
    response.choices = [choice]
    response.usage   = usage
    return response


# ── call_llm tests ───────────────────────────────────────────────────────────

class TestCallLlm:

    @patch("core.llm_client._call_openai")
    def test_returns_stripped_text(self, mock_openai):
        mock_openai.return_value = _make_mock_response("  Hello world!  ")

        from core.llm_client import call_llm
        result = call_llm("Say hello")
        assert result == "Hello world!"

    @patch("core.llm_client._call_openai")
    def test_uses_config_defaults(self, mock_openai):
        mock_openai.return_value = _make_mock_response("ok")

        from core.llm_client import call_llm
        from core.config import config
        call_llm("test")

        _, kwargs_model, kwargs_temp, kwargs_tokens = mock_openai.call_args[0]
        assert kwargs_model  == config.MODEL_NAME
        assert kwargs_temp   == config.TEMPERATURE
        assert kwargs_tokens == config.MAX_TOKENS

    @patch("core.llm_client._call_openai")
    def test_overrides_respected(self, mock_openai):
        mock_openai.return_value = _make_mock_response("ok")

        from core.llm_client import call_llm
        call_llm("test", model="gpt-4o", temperature=0.7, max_tokens=512)

        _, kwargs_model, kwargs_temp, kwargs_tokens = mock_openai.call_args[0]
        assert kwargs_model  == "gpt-4o"
        assert kwargs_temp   == 0.7
        assert kwargs_tokens == 512

    @patch("core.llm_client._call_openai", side_effect=Exception("API down"))
    def test_raises_runtime_error_on_failure(self, _):
        from core.llm_client import call_llm
        with pytest.raises(RuntimeError, match="LLM call failed"):
            call_llm("test")


# ── call_llm_structured tests ────────────────────────────────────────────────

class SentimentResult(BaseModel):
    sentiment: str
    confidence: float


class TestCallLlmStructured:

    @patch("core.llm_client._call_openai")
    def test_valid_json_returns_model(self, mock_openai):
        payload = {"sentiment": "positive", "confidence": 0.95}
        mock_openai.return_value = _make_mock_response(json.dumps(payload))

        from core.llm_client import call_llm_structured
        result = call_llm_structured("Analyze this text.", SentimentResult)

        assert isinstance(result, SentimentResult)
        assert result.sentiment  == "positive"
        assert result.confidence == 0.95

    @patch("core.llm_client._call_openai")
    def test_strips_markdown_fences(self, mock_openai):
        payload = {"sentiment": "neutral", "confidence": 0.5}
        raw     = f"```json\n{json.dumps(payload)}\n```"
        mock_openai.return_value = _make_mock_response(raw)

        from core.llm_client import call_llm_structured
        result = call_llm_structured("Analyze.", SentimentResult)
        assert result.sentiment == "neutral"

    @patch("core.llm_client._call_openai")
    def test_invalid_json_raises_value_error(self, mock_openai):
        mock_openai.return_value = _make_mock_response("not json at all")

        from core.llm_client import call_llm_structured
        with pytest.raises(ValueError, match="invalid JSON"):
            call_llm_structured("Analyze.", SentimentResult)

    @patch("core.llm_client._call_openai")
    def test_wrong_schema_raises_value_error(self, mock_openai):
        # JSON is valid but missing required fields
        mock_openai.return_value = _make_mock_response('{"foo": "bar"}')

        from core.llm_client import call_llm_structured
        with pytest.raises(ValueError, match="schema validation"):
            call_llm_structured("Analyze.", SentimentResult)


# ── cost estimation tests ─────────────────────────────────────────────────────

class TestCostEstimation:

    def test_known_model_returns_nonzero(self):
        from core.llm_client import _estimate_cost
        cost = _estimate_cost("gpt-4o-mini", input_tokens=1000, output_tokens=500)
        assert cost > 0

    def test_unknown_model_returns_zero(self):
        from core.llm_client import _estimate_cost
        cost = _estimate_cost("some-unknown-model", input_tokens=1000, output_tokens=500)
        assert cost == 0.0

    def test_cost_scales_with_tokens(self):
        from core.llm_client import _estimate_cost
        small = _estimate_cost("gpt-4o-mini", 100,  50)
        large = _estimate_cost("gpt-4o-mini", 1000, 500)
        assert large > small


# ── retry logic tests ─────────────────────────────────────────────────────────

class TestRetry:

    def test_succeeds_on_first_attempt(self):
        from core.retry import with_retry
        calls = []

        @with_retry(max_attempts=3, base_delay=0.01)
        def fn():
            calls.append(1)
            return "ok"

        assert fn() == "ok"
        assert len(calls) == 1

    def test_retries_on_transient_failure(self):
        from core.retry import with_retry
        calls = []

        @with_retry(max_attempts=3, base_delay=0.01, retryable_exceptions=(ValueError,))
        def fn():
            calls.append(1)
            if len(calls) < 3:
                raise ValueError("transient")
            return "ok"

        assert fn() == "ok"
        assert len(calls) == 3

    def test_raises_after_max_attempts(self):
        from core.retry import with_retry

        @with_retry(max_attempts=2, base_delay=0.01, retryable_exceptions=(ValueError,))
        def fn():
            raise ValueError("always fails")

        with pytest.raises(ValueError, match="always fails"):
            fn()

    def test_non_retryable_propagates_immediately(self):
        from core.retry import with_retry
        calls = []

        @with_retry(max_attempts=3, base_delay=0.01, retryable_exceptions=(ValueError,))
        def fn():
            calls.append(1)
            raise TypeError("not retryable")

        with pytest.raises(TypeError):
            fn()
        assert len(calls) == 1  # Only one attempt — no retry for TypeError