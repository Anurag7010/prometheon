"""
tests/test_llm_client.py

Unit tests for core/llm_client.py and core/retry.py.
No real API calls — all OpenAI interactions are mocked.

Run: python -m pytest tests/test_llm_client.py -v
"""

import pytest
from unittest.mock import MagicMock, patch
from pydantic import BaseModel


# ── Helpers ───────────────────────────────────────────────────────────────────

def _mock_response(text: str, input_tokens: int = 10, output_tokens: int = 20) -> MagicMock:
    """Build a fake OpenAI ChatCompletion response."""
    choice          = MagicMock()
    choice.message.content = text
    usage           = MagicMock()
    usage.prompt_tokens     = input_tokens
    usage.completion_tokens = output_tokens
    resp            = MagicMock()
    resp.choices    = [choice]
    resp.usage      = usage
    return resp


# ── complete() — normalized shape ────────────────────────────────────────────

class TestComplete:

    @patch("core.llm_client._call_openai")
    def test_success_returns_correct_shape(self, mock_openai):
        """Successful call returns all required keys with correct types."""
        mock_openai.return_value = _mock_response("  Hello!  ")
        from core.llm_client import complete
        result = complete("Say hello")
        assert set(result.keys()) == {"text", "tokens_used", "model", "latency_ms", "error"}
        assert result["text"]        == "Hello!"
        assert result["error"]       is None
        assert result["tokens_used"] == 30
        assert isinstance(result["latency_ms"], float)

    @patch("core.llm_client._call_openai")
    def test_overrides_respected(self, mock_openai):
        """Per-call model/temperature/max_tokens overrides are forwarded."""
        mock_openai.return_value = _mock_response("ok")
        from core.llm_client import complete
        complete("test", model="gpt-4o", temperature=0.9, max_tokens=256)
        _, m, t, tok = mock_openai.call_args[0]
        assert m   == "gpt-4o"
        assert t   == 0.9
        assert tok == 256

    @patch("core.llm_client._call_openai", side_effect=Exception("timeout"))
    def test_failure_returns_error_shape(self, _):
        """API failure returns structured error dict, not an exception."""
        from core.llm_client import complete
        result = complete("test")
        assert result["error"] is not None
        assert result["text"]        == ""
        assert result["tokens_used"] == 0

    @patch("core.llm_client._call_openai")
    def test_trace_id_forwarded_without_crash(self, mock_openai):
        """trace_id parameter is accepted and forwarded without error."""
        mock_openai.return_value = _mock_response("ok")
        from core.llm_client import complete
        result = complete("test", trace_id="test-trace-123")
        assert result["error"] is None


# ── call_llm() — plain string interface ──────────────────────────────────────

class TestCallLlm:

    @patch("core.llm_client._call_openai")
    def test_returns_stripped_text(self, mock_openai):
        """call_llm strips whitespace from the response."""
        mock_openai.return_value = _mock_response("  World  ")
        from core.llm_client import call_llm
        assert call_llm("Hello") == "World"

    @patch("core.llm_client._call_openai", side_effect=Exception("down"))
    def test_raises_runtime_error_on_failure(self, _):
        """call_llm raises RuntimeError when complete() returns an error."""
        from core.llm_client import call_llm
        with pytest.raises(RuntimeError, match="LLM call failed"):
            call_llm("test")


# ── call_llm_structured() ────────────────────────────────────────────────────

class _Schema(BaseModel):
    sentiment: str
    score: float


class TestCallLlmStructured:
    import json as _json

    @patch("core.llm_client._call_openai")
    def test_valid_json_parses_to_model(self, mock_openai):
        """Valid JSON response is parsed into the Pydantic schema."""
        import json
        mock_openai.return_value = _mock_response(json.dumps({"sentiment": "positive", "score": 0.9}))
        from core.llm_client import call_llm_structured
        result = call_llm_structured("Analyze.", _Schema)
        assert isinstance(result, _Schema)
        assert result.sentiment == "positive"

    @patch("core.llm_client._call_openai")
    def test_strips_markdown_fences(self, mock_openai):
        """Markdown-fenced JSON is cleaned before parsing."""
        import json
        raw = f"```json\n{json.dumps({'sentiment': 'neutral', 'score': 0.5})}\n```"
        mock_openai.return_value = _mock_response(raw)
        from core.llm_client import call_llm_structured
        result = call_llm_structured("Analyze.", _Schema)
        assert result.score == 0.5

    @patch("core.llm_client._call_openai")
    def test_invalid_json_raises_value_error(self, mock_openai):
        """Non-JSON response raises ValueError."""
        mock_openai.return_value = _mock_response("not json at all")
        from core.llm_client import call_llm_structured
        with pytest.raises(ValueError, match="invalid JSON"):
            call_llm_structured("Analyze.", _Schema)

    @patch("core.llm_client._call_openai")
    def test_schema_mismatch_raises_value_error(self, mock_openai):
        """Valid JSON that doesn't match the schema raises ValueError."""
        mock_openai.return_value = _mock_response('{"wrong_field": 1}')
        from core.llm_client import call_llm_structured
        with pytest.raises(ValueError, match="schema validation"):
            call_llm_structured("Analyze.", _Schema)


# ── Retry logic ───────────────────────────────────────────────────────────────

class TestRetry:

    def test_succeeds_on_first_attempt(self):
        """No retries when function succeeds immediately."""
        from core.retry import with_retry
        calls = []

        @with_retry(max_attempts=3, base_delay=0.01)
        def fn():
            calls.append(1)
            return "ok"

        assert fn() == "ok"
        assert len(calls) == 1

    def test_retries_transient_failure(self):
        """Retries on retryable exception, succeeds on third attempt."""
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
        """Raises after exhausting all retries."""
        from core.retry import with_retry

        @with_retry(max_attempts=2, base_delay=0.01, retryable_exceptions=(ValueError,))
        def fn():
            raise ValueError("always fails")

        with pytest.raises(ValueError):
            fn()

    def test_non_retryable_propagates_immediately(self):
        """Non-retryable exception type is not retried."""
        from core.retry import with_retry
        calls = []

        @with_retry(max_attempts=3, base_delay=0.01, retryable_exceptions=(ValueError,))
        def fn():
            calls.append(1)
            raise TypeError("not retryable")

        with pytest.raises(TypeError):
            fn()
        assert len(calls) == 1


# ── Cost estimation ───────────────────────────────────────────────────────────

class TestCostEstimation:

    def test_known_model_returns_positive(self):
        from core.llm_client import _estimate_cost
        assert _estimate_cost("gpt-4o-mini", 1000, 500) > 0

    def test_unknown_model_returns_zero(self):
        from core.llm_client import _estimate_cost
        assert _estimate_cost("mystery-model", 1000, 500) == 0.0

    def test_scales_with_token_count(self):
        from core.llm_client import _estimate_cost
        small = _estimate_cost("gpt-4o-mini", 100, 50)
        large = _estimate_cost("gpt-4o-mini", 1000, 500)
        assert large > small