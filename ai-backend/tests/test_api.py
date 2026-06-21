"""
tests/test_api.py

Integration tests for all FastAPI endpoints.

Uses httpx.AsyncClient with ASGITransport to call the app directly —
no real HTTP server is started, no real OpenAI calls are made,
no real RAG pipeline runs. All external I/O is mocked.

Run: pytest tests/test_api.py -v
"""

import json
import io
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

from api.app import app

# Test credentials matching the default config
TEST_API_KEY = "dev-internal-key-change-in-production"
HEADERS = {"X-API-Key": TEST_API_KEY, "X-Request-ID": "test-trace-001"}

# Reusable mock RAG responses
MOCK_ASK_RESULT = {
    "answer": "This is a test answer",
    "sources": [
        {"content": "test source content", "score": 0.95, "metadata": {"source": "test.pdf", "chunk_index": 0}, "citation_id": None}
    ],
    "trace_id": "test-trace-001",
    "latency_breakdown": {"retrieval_ms": 100.0, "generation_ms": 200.0, "total_ms": 300.0},
    "error": None,
    "guardrail_rejected": False,
    "no_results": False,
    "retrieval_quality": {"quality": "good", "max_score": 0.95, "avg_score": 0.95, "chunk_count": 1},
}

MOCK_RETRIEVE_CHUNKS = [
    {"content": "test chunk content", "score": 0.95, "metadata": {"source": "test.pdf", "chunk_index": 0}},
]

MOCK_INGEST_RESULT = {"status": "ok", "chunk_count": 3, "error": None}


# ── GET /health ───────────────────────────────────────────────────────────────

class TestHealth:

    async def test_returns_200(self):
        """Health endpoint must always return 200 — load balancers depend on this."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/health")
        assert res.status_code == 200

    async def test_no_api_key_required(self):
        """Health check must be callable without credentials — probes don't authenticate."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/health")
        assert res.status_code == 200

    async def test_response_has_status_field(self):
        """Response must include top-level status field for monitoring tools."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/health")
        body = res.json()
        assert "status" in body
        assert body["status"] in ("ok", "degraded")

    async def test_response_has_components_dict(self):
        """Response must include per-component breakdown for observability."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/health")
        body = res.json()
        assert "components" in body
        assert isinstance(body["components"], dict)

    async def test_trace_id_echoed_in_response_headers(self):
        """X-Request-ID sent in request must be echoed back in response headers."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/health", headers={"X-Request-ID": "probe-123"})
        assert res.headers.get("x-request-id") == "probe-123"


# ── POST /ask ─────────────────────────────────────────────────────────────────

class TestAsk:

    async def test_successful_ask_returns_200(self):
        """A valid ask returns 200 with the AskResponse shape."""
        with patch("rag.rag_interface.ask", new_callable=AsyncMock, return_value=MOCK_ASK_RESULT), \
             patch("rag.rag_interface.retrieve", new_callable=AsyncMock, return_value=MOCK_RETRIEVE_CHUNKS):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                res = await client.post("/ask", json={"query": "What is this?"}, headers=HEADERS)
        assert res.status_code == 200

    async def test_answer_field_is_present(self):
        """Response must include a non-empty answer field."""
        with patch("rag.rag_interface.ask", new_callable=AsyncMock, return_value=MOCK_ASK_RESULT), \
             patch("rag.rag_interface.retrieve", new_callable=AsyncMock, return_value=MOCK_RETRIEVE_CHUNKS):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                res = await client.post("/ask", json={"query": "What is this?"}, headers=HEADERS)
        body = res.json()
        assert "answer" in body
        assert isinstance(body["answer"], str)
        assert len(body["answer"]) > 0

    async def test_sources_field_is_list(self):
        """Sources must be a list — empty is valid if no chunks matched."""
        with patch("rag.rag_interface.ask", new_callable=AsyncMock, return_value=MOCK_ASK_RESULT), \
             patch("rag.rag_interface.retrieve", new_callable=AsyncMock, return_value=MOCK_RETRIEVE_CHUNKS):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                res = await client.post("/ask", json={"query": "What is this?"}, headers=HEADERS)
        body = res.json()
        assert "sources" in body
        assert isinstance(body["sources"], list)

    async def test_trace_id_present_in_response(self):
        """trace_id in response lets the caller correlate logs across services."""
        with patch("rag.rag_interface.ask", return_value=MOCK_ASK_RESULT), \
             patch("rag.rag_interface.retrieve", return_value=MOCK_RETRIEVE_CHUNKS):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                res = await client.post("/ask", json={"query": "What is this?"}, headers=HEADERS)
        body = res.json()
        assert "trace_id" in body

    async def test_missing_query_field_returns_422(self):
        """Missing required query field must return 422 Unprocessable Entity."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post("/ask", json={}, headers=HEADERS)
        assert res.status_code == 422

    async def test_empty_query_string_returns_422(self):
        """Empty string query is semantically invalid — must be rejected before hitting RAG."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post("/ask", json={"query": ""}, headers=HEADERS)
        assert res.status_code == 422

    async def test_missing_api_key_returns_401(self):
        """Requests without X-API-Key must be rejected — Next.js always sends it."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post("/ask", json={"query": "What is this?"})
        assert res.status_code == 401

    async def test_wrong_api_key_returns_401(self):
        """Wrong key must be treated the same as missing — never reveal whether key exists."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                "/ask",
                json={"query": "What is this?"},
                headers={"X-API-Key": "wrong-key"}
            )
        assert res.status_code == 401

    async def test_rag_error_returns_500_with_error_response(self):
        """Pipeline errors must surface as 500 ErrorResponse — never a raw Python traceback."""
        error_result = {**MOCK_ASK_RESULT, "answer": "", "error": "LLM timeout"}
        with patch("rag.rag_interface.ask", return_value=error_result), \
             patch("rag.rag_interface.retrieve", return_value=[]):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                res = await client.post("/ask", json={"query": "What is this?"}, headers=HEADERS)
        assert res.status_code == 500
        body = res.json()
        assert "error" in body
        assert "Traceback" not in body.get("message", "")
        assert "Traceback" not in body.get("error", "")

    async def test_error_response_never_contains_traceback(self):
        """Stack traces must never reach the client — they expose internal implementation details."""
        with patch("rag.rag_interface.ask", side_effect=RuntimeError("Internal error")):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                res = await client.post("/ask", json={"query": "What is this?"}, headers=HEADERS)
        body = res.json()
        body_str = json.dumps(body)
        assert "Traceback" not in body_str
        assert "File \"" not in body_str


# ── POST /ingest ──────────────────────────────────────────────────────────────

class TestIngest:

    def _make_pdf_upload(self, filename: str = "test.pdf") -> tuple:
        """Create a minimal in-memory PDF for upload tests."""
        return (filename, io.BytesIO(b"%PDF-1.4\ntest content"), "application/pdf")

    async def test_successful_ingest_returns_200(self):
        """Valid file upload with mocked pipeline returns 200 IngestResponse."""
        with patch("rag.rag_interface.ingest", return_value=MOCK_INGEST_RESULT):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                filename, content, mime = self._make_pdf_upload()
                res = await client.post(
                    "/ingest",
                    files={"file": (filename, content, mime)},
                    headers=HEADERS,
                )
        assert res.status_code == 200

    async def test_ingest_response_has_status_and_chunk_count(self):
        """IngestResponse must expose status and chunk_count for the upload UI."""
        with patch("rag.rag_interface.ingest", return_value=MOCK_INGEST_RESULT):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                filename, content, mime = self._make_pdf_upload()
                res = await client.post(
                    "/ingest",
                    files={"file": (filename, content, mime)},
                    headers=HEADERS,
                )
        body = res.json()
        assert body["status"] == "ok"
        assert body["chunk_count"] == 3

    async def test_missing_file_returns_422(self):
        """Missing file field must return 422 — not 500 — so the UI can show the right error."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                "/ingest",
                data={"metadata": "{}"},
                headers=HEADERS,
            )
        assert res.status_code == 422

    async def test_missing_api_key_returns_401(self):
        """Ingest without credentials must be rejected."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            filename, content, mime = self._make_pdf_upload()
            res = await client.post(
                "/ingest",
                files={"file": (filename, content, mime)},
            )
        assert res.status_code == 401

    async def test_pipeline_error_returns_500(self):
        """Ingest pipeline failure returns 500 ErrorResponse — not an unhandled exception."""
        error_result = {"status": "error", "chunk_count": 0, "error": "Parser failed"}
        with patch("rag.rag_interface.ingest", return_value=error_result):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                filename, content, mime = self._make_pdf_upload()
                res = await client.post(
                    "/ingest",
                    files={"file": (filename, content, mime)},
                    headers=HEADERS,
                )
        assert res.status_code == 500
        body = res.json()
        assert "error" in body


# ── GET /retrieve ─────────────────────────────────────────────────────────────

class TestRetrieve:

    async def test_successful_retrieve_returns_200(self):
        """Valid retrieve returns 200 with chunks list."""
        with patch("rag.rag_interface.retrieve", return_value=MOCK_RETRIEVE_CHUNKS):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                res = await client.get("/retrieve?query=test+query", headers=HEADERS)
        assert res.status_code == 200

    async def test_chunks_have_correct_shape(self):
        """Each chunk must have content, score, metadata — the UI depends on this shape."""
        with patch("rag.rag_interface.retrieve", return_value=MOCK_RETRIEVE_CHUNKS):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                res = await client.get("/retrieve?query=test+query", headers=HEADERS)
        body = res.json()
        assert "chunks" in body
        assert len(body["chunks"]) > 0
        chunk = body["chunks"][0]
        assert "content" in chunk
        assert "score" in chunk
        assert "metadata" in chunk

    async def test_missing_query_param_returns_422(self):
        """Missing query parameter must be caught at validation — 422 not 500."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/retrieve", headers=HEADERS)
        assert res.status_code == 422

    async def test_missing_api_key_returns_401(self):
        """Retrieve without credentials must be rejected."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/retrieve?query=test", )
        assert res.status_code == 401

    async def test_strategy_param_forwarded_to_rag(self):
        """strategy query param must reach rag_interface.retrieve — not silently dropped."""
        with patch("rag.rag_interface.retrieve", return_value=MOCK_RETRIEVE_CHUNKS) as mock_retrieve:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                await client.get("/retrieve?query=test&strategy=hybrid", headers=HEADERS)
        call_kwargs = mock_retrieve.call_args.kwargs
        assert call_kwargs["query"] == "test"
        assert call_kwargs["top_k"] == 5
        assert call_kwargs["strategy"] == "hybrid"


# ── POST /ask/stream ──────────────────────────────────────────────────────────

async def _read_sse_events(response) -> list[dict]:
    """Read all SSE events from a streaming httpx response into a list of dicts."""
    events = []
    full_text = response.text
    for line in full_text.splitlines():
        if line.startswith("data: "):
            data = line[6:]
            if data and data != "[DONE]":
                events.append(json.loads(data))
    return events


async def _mock_llm_stream(*args, **kwargs):
    """Async generator that yields three test tokens."""
    for token in ["Hello", " world", "!"]:
        yield token


class TestAskStream:

    async def test_returns_200_with_event_stream_content_type(self):
        """Streaming endpoint must return text/event-stream — browsers use this to open EventSource."""
        with patch("rag.rag_interface.retrieve", return_value=MOCK_RETRIEVE_CHUNKS), \
             patch("core.llm_client.stream", _mock_llm_stream):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                res = await client.post("/ask/stream", json={"query": "What is this?"}, headers=HEADERS)
        assert res.status_code == 200
        assert "text/event-stream" in res.headers.get("content-type", "")

    async def test_cache_control_no_cache_header(self):
        """Cache-Control: no-cache is required for SSE — proxies must not buffer the stream."""
        with patch("rag.rag_interface.retrieve", return_value=MOCK_RETRIEVE_CHUNKS), \
             patch("core.llm_client.stream", _mock_llm_stream):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                res = await client.post("/ask/stream", json={"query": "What is this?"}, headers=HEADERS)
        assert "no-cache" in res.headers.get("cache-control", "")

    async def test_stream_yields_token_events(self):
        """Each LLM token must arrive as a {type: token, content: str} SSE event."""
        with patch("rag.rag_interface.retrieve", return_value=MOCK_RETRIEVE_CHUNKS), \
             patch("core.llm_client.stream", _mock_llm_stream):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                res = await client.post("/ask/stream", json={"query": "What is this?"}, headers=HEADERS)
        events = await _read_sse_events(res)
        token_events = [e for e in events if e.get("type") == "token"]
        assert len(token_events) == 3
        assert token_events[0]["content"] == "Hello"
        assert token_events[1]["content"] == " world"
        assert token_events[2]["content"] == "!"

    async def test_stream_yields_sources_event_after_tokens(self):
        """Sources event must come after all tokens — so the UI shows answer first."""
        with patch("rag.rag_interface.retrieve", return_value=MOCK_RETRIEVE_CHUNKS), \
             patch("core.llm_client.stream", _mock_llm_stream):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                res = await client.post("/ask/stream", json={"query": "What is this?"}, headers=HEADERS)
        events = await _read_sse_events(res)
        types = [e.get("type") for e in events]
        assert "sources" in types
        # sources must appear after all token events
        last_token_idx = max((i for i, t in enumerate(types) if t == "token"), default=-1)
        sources_idx = types.index("sources")
        assert sources_idx > last_token_idx

    async def test_stream_yields_done_event_last(self):
        """Done event must be the final event — signals the browser to close the connection."""
        with patch("rag.rag_interface.retrieve", return_value=MOCK_RETRIEVE_CHUNKS), \
             patch("core.llm_client.stream", _mock_llm_stream):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                res = await client.post("/ask/stream", json={"query": "What is this?"}, headers=HEADERS)
        events = await _read_sse_events(res)
        assert events[-1]["type"] == "done"

    async def test_done_event_has_trace_id_and_latency_ms(self):
        """Done event fields let the browser correlate latency with the request trace."""
        with patch("rag.rag_interface.retrieve", return_value=MOCK_RETRIEVE_CHUNKS), \
             patch("core.llm_client.stream", _mock_llm_stream):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                res = await client.post("/ask/stream", json={"query": "What is this?"}, headers=HEADERS)
        events = await _read_sse_events(res)
        done = next(e for e in events if e.get("type") == "done")
        assert "trace_id" in done
        assert "latency_ms" in done
        assert isinstance(done["latency_ms"], (int, float))

    async def test_missing_api_key_returns_401(self):
        """Auth check must happen before the stream starts — 401 before any SSE events."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post("/ask/stream", json={"query": "What is this?"})
        assert res.status_code == 401

    async def test_missing_query_returns_422(self):
        """Missing required query field must return 422 before stream starts."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post("/ask/stream", json={}, headers=HEADERS)
        assert res.status_code == 422

    async def test_llm_error_yields_error_event(self):
        """LLM error mid-stream must yield error SSE event — the server must not crash."""
        async def erroring_stream(*args, **kwargs):
            yield "Hello"
            raise RuntimeError("LLM connection lost")

        with patch("rag.rag_interface.retrieve", return_value=MOCK_RETRIEVE_CHUNKS), \
             patch("core.llm_client.stream", erroring_stream):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                res = await client.post("/ask/stream", json={"query": "What is this?"}, headers=HEADERS)
        # Response itself should be 200 (streaming started) but contain error event
        assert res.status_code == 200
        events = await _read_sse_events(res)
        assert any(e.get("type") == "error" for e in events)
