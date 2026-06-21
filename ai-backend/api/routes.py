"""
api/routes.py

All HTTP endpoint handlers. Imported and registered by api/app.py.

Pattern every route follows:
  1. Extract trace_id from request.state (set by middleware in app.py)
  2. Wrap business logic in try/except
  3. On success: return the typed response model
  4. On error: log full error with trace_id, return ErrorResponse — never raw exceptions
"""

import asyncio
import json
import os
import tempfile
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse

from api.models import (
    AgentRunResponse,
    AgentStepResponse,
    AskRequest,
    AskResponse,
    ErrorResponse,
    HealthResponse,
    IngestResponse,
    RetrieveResponse,
    SourceResponse,
)
from core.user_tier import get_tier_config
from observability.logger import get_logger, log_pipeline_event
from observability.tracer import new_trace_id

logger = get_logger(__name__)
router = APIRouter()


def _resolve_tier(request: Request):
    """Extract user email from header and return tier config."""
    email = request.headers.get("X-User-Email")
    return get_tier_config(email)


from core.cost_controller import cost_controller

# Production middleware — imported lazily to avoid circular imports at module load
from core.rate_limiter import ask_rate_limiter, ingest_rate_limiter
from core.request_queue import request_queue

# ── RAG adapter ───────────────────────────────────────────────────────────────


class _RAGAdapter:
    """Wraps module-level rag_interface functions as an object for tool injection."""

    async def retrieve(self, query: str, top_k: int = 5, strategy: str = "semantic") -> list[dict]:
        """Delegate to module-level retrieve()."""
        from rag.rag_interface import retrieve as _retrieve

        return await _retrieve(query=query, top_k=top_k, strategy=strategy)


# ── ChromaDB document repository ──────────────────────────────────────────────

from dataclasses import dataclass as _dc
from datetime import datetime as _dt


@_dc
class _ChromaDoc:
    id: str
    filename: str
    status: str
    chunk_count: int
    created_at: _dt | None
    updated_at: _dt | None


class _ChromaDocumentRepository:
    """Queries ChromaDB vectorstore to list ingested documents."""

    async def findByUser(self, user_id: str) -> list[_ChromaDoc]:
        """Return all ingested documents (Python side has no user concept)."""
        try:
            import chromadb

            client = chromadb.PersistentClient(path="external/rag_system/db/chroma_db")
            collection = client.get_or_create_collection("langchain")
            result = collection.get(include=["metadatas"])

            seen: dict[str, _ChromaDoc] = {}
            for metadata in result.get("metadatas") or []:
                source = metadata.get("source") or metadata.get("file") or "unknown"
                if source not in seen:
                    seen[source] = _ChromaDoc(
                        id=source,
                        filename=source.split("/")[-1] if "/" in source else source,
                        status="ingested",
                        chunk_count=0,
                        created_at=None,
                        updated_at=None,
                    )
                seen[source].chunk_count += 1
            return list(seen.values())
        except Exception as exc:
            logger.warning("chroma_document_list_error", extra={"error": str(exc)})
            return []

    async def findById(self, doc_id: str) -> _ChromaDoc | None:
        """Find a document by source ID."""
        docs = await self.findByUser("")
        return next((d for d in docs if d.id == doc_id or d.filename == doc_id), None)


# ── Helper ────────────────────────────────────────────────────────────────────


def _error_response(
    error_code: str,
    message: str,
    trace_id: str | None,
    status_code: int,
) -> JSONResponse:
    """Build a normalized ErrorResponse JSON response."""
    body = ErrorResponse(
        error=error_code,
        message=message,
        trace_id=trace_id,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
    return JSONResponse(status_code=status_code, content=body.model_dump())


def _normalize_source(chunk: dict) -> SourceResponse:
    """Convert a raw retrieve() dict to a SourceResponse model."""
    return SourceResponse(
        content=chunk.get("content", ""),
        score=chunk.get("score"),
        metadata=chunk.get("metadata", {}),
    )


# ── GET /health ───────────────────────────────────────────────────────────────


@router.get("/health", tags=["system"])
async def health(request: Request) -> JSONResponse:
    """
    Component-level health check.

    Always returns HTTP 200. Per-component status is in the body.
    Load balancers use HTTP status for routing decisions — a 500 takes
    the instance out of rotation even if only one component is degraded.
    """
    components: dict = {}

    # Check: logger
    try:
        logger.info("health_check", extra={"check": "logger"})
        components["logger"] = "ok"
    except Exception as exc:
        components["logger"] = f"error: {exc}"

    # Check: config
    try:
        from core.config import config

        _ = config.MODEL_NAME
        _ = config.OPENAI_API_KEY
        components["config"] = "ok"
    except Exception as exc:
        components["config"] = f"error: {exc}"

    # Check: LLM client (import only — no live API call to keep health fast)
    try:
        from core.llm_client import complete  # noqa: F401

        components["llm"] = "ok"
    except Exception as exc:
        components["llm"] = f"error: {exc}"

    # Check: RAG interface importable
    try:
        from rag.rag_interface import retrieve  # noqa: F401

        components["rag"] = "ok"
    except Exception as exc:
        components["rag"] = f"error: {exc}"

    overall = "ok" if all(v == "ok" for v in components.values()) else "degraded"

    import psutil

    process = psutil.Process()
    memory_mb = process.memory_info().rss / 1024 / 1024

    from core.cache import llm_cache, retrieval_cache

    return JSONResponse(
        content={
            "status": overall,
            "components": components,
            "cache": {
                "retrieval": retrieval_cache.stats,
                "llm": llm_cache.stats,
            },
            "queue": request_queue.stats,
            "rate_limiter": ask_rate_limiter.get_stats(),
            "system": {
                "memory_mb": round(memory_mb, 1),
                "memory_warning": memory_mb > 1024,
            },
        }
    )


# ── POST /ask ─────────────────────────────────────────────────────────────────


async def _run_ask_pipeline(
    body: AskRequest, user_id: str, trace_id: str, tier_config=None
) -> AskResponse | JSONResponse:
    """The actual RAG/agent pipeline — called via request_queue.run()."""
    from agents.router import QueryRoute, route_query

    route = route_query(body.query, trace_id)

    if route == QueryRoute.AGENT:
        from agents.factory import create_agent

        rag = _RAGAdapter()
        doc_repo = _ChromaDocumentRepository()
        agent = create_agent(
            rag_interface=rag,
            documents_repository=doc_repo,
            tier_config=tier_config,
        )
        result = await agent.run(
            query=body.query,
            user_id=user_id,
            trace_id=trace_id,
            conversation_history=body.history or [],
            tier_config=tier_config,
        )
        return AskResponse(
            answer=result.answer,
            sources=[],
            trace_id=trace_id,
            latency_breakdown={"retrieval_ms": 0, "generation_ms": 0, "total_ms": 0},
            guardrail_rejected=False,
            no_results=False,
            retrieval_quality={},
            routed_to="agent",
        )

    from rag.rag_interface import ask as rag_ask

    result = await rag_ask(
        query=body.query, history=body.history, trace_id=trace_id, tier_config=tier_config
    )

    if result.get("error"):
        logger.error("ask_pipeline_error", extra={"trace_id": trace_id, "error": result["error"]})
        return _error_response("pipeline_error", result["error"], trace_id, 500)

    sources = [
        SourceResponse(
            content=c.get("content", ""),
            score=c.get("score"),
            metadata=c.get("metadata", {}),
            citation_id=c.get("citation_id"),
        )
        for c in result.get("sources", [])
        if "error" not in c
    ]

    return AskResponse(
        answer=result["answer"],
        sources=sources,
        trace_id=result["trace_id"],
        latency_breakdown=result["latency_breakdown"],
        guardrail_rejected=result.get("guardrail_rejected", False),
        no_results=result.get("no_results", False),
        retrieval_quality=result.get("retrieval_quality", {}),
        routed_to="rag",
    )


@router.post("/ask", response_model=AskResponse, tags=["rag"])
async def ask(body: AskRequest, request: Request) -> AskResponse | JSONResponse:
    """
    Full RAG pipeline: retrieve relevant chunks → generate grounded answer.

    This is the core endpoint — the chat UI calls this for every user message.
    Applies rate limiting, daily token budget check, and concurrency queuing
    before running the pipeline.
    """
    trace_id: str = getattr(request.state, "trace_id", new_trace_id())
    user_id: str = request.headers.get("X-User-ID", "anonymous")
    tier_config = _resolve_tier(request)

    log_pipeline_event(
        event="user_tier_resolved",
        trace_id=trace_id,
        metadata={
            "tier": tier_config.tier.value,
            "llm_provider": tier_config.llm_provider,
            "embedding_provider": tier_config.embedding_provider,
        },
    )

    # 1. Rate limit check
    rate_result = ask_rate_limiter.check(user_id, trace_id)
    if not rate_result.allowed:
        return JSONResponse(
            status_code=429,
            content={
                "error": "RATE_LIMITED",
                "message": f"Too many requests. Try again in {rate_result.retry_after} seconds.",
                "retry_after": rate_result.retry_after,
            },
            headers={"Retry-After": str(rate_result.retry_after)},
        )

    # 2. Budget check
    budget = cost_controller.check_budget(user_id, trace_id)
    if not budget["allowed"]:
        return JSONResponse(
            status_code=429,
            content={
                "error": "BUDGET_EXCEEDED",
                "message": (
                    f"Daily token budget exceeded. Resets at midnight UTC. "
                    f"Used: {budget['used_today']}/{budget['budget']} tokens."
                ),
                "reset_at": budget["reset_at"],
            },
        )

    # 3. Run through request queue (concurrency control)
    try:
        result = await request_queue.run(
            _run_ask_pipeline,
            body,
            user_id,
            trace_id,
            tier_config=tier_config,
            trace_id=trace_id,
        )
    except TimeoutError as exc:
        return JSONResponse(
            status_code=503,
            content={"error": "SERVICE_BUSY", "message": str(exc)},
        )
    except Exception as exc:
        logger.error(
            "ask_unhandled_error", extra={"trace_id": trace_id, "error": str(exc)}, exc_info=True
        )
        return _error_response("ask_failed", str(exc), trace_id, 500)

    # 4. Record token usage from result metadata (best-effort)
    token_usage = getattr(result, "token_usage", None) or {}
    if token_usage:
        cost_controller.record_usage(
            user_id=user_id,
            input_tokens=token_usage.get("input", 0),
            output_tokens=token_usage.get("output", 0),
            trace_id=trace_id,
        )

    return result


# ── POST /ask/stream ──────────────────────────────────────────────────────────


def _sse_event(data: dict) -> str:
    """Format a dict as an SSE data event."""
    return f"data: {json.dumps(data)}\n\n"


@router.post("/ask/stream", tags=["rag"])
async def ask_stream(body: AskRequest, request: Request) -> StreamingResponse:
    """
    Streaming version of /ask.

    SSE events emitted in order:
      data: {"type": "token",   "content": "..."}   — one per LLM token
      data: {"type": "sources", "sources": [...]}    — after last token
      data: {"type": "done",    "trace_id": "...", "latency_ms": N}
      data: {"type": "error",   "message": "..."}    — only on failure
    """
    trace_id: str = getattr(request.state, "trace_id", new_trace_id())
    tier_config = _resolve_tier(request)

    async def generate():
        t0 = time.perf_counter()
        try:
            from core.llm_client import stream as llm_stream
            from rag.rag_interface import retrieve as rag_retrieve

            chunks: list[dict] = await rag_retrieve(
                body.query, body.top_k, body.strategy, tier_config=tier_config
            )
            valid_chunks = [c for c in chunks if "error" not in c]

            # Build plain-text context from retrieved dicts
            context_parts = [
                f"--- Document {i + 1} ---\n{chunk.get('content', '')}"
                for i, chunk in enumerate(valid_chunks)
            ]
            context_text = "\n\n".join(context_parts)
            prompt = (
                f"Based on the following documents, answer: {body.query}\n\n"
                f"{context_text}\n\nANSWER:"
            )

            # Stream LLM tokens one by one
            async for token in llm_stream(prompt, trace_id=trace_id, tier_config=tier_config):
                yield _sse_event({"type": "token", "content": token})

            # Sources arrive after the last token — user sees answer first, sources below
            sources = [
                {
                    "content": c.get("content", ""),
                    "score": c.get("score"),
                    "metadata": c.get("metadata", {}),
                }
                for c in valid_chunks
            ]
            yield _sse_event({"type": "sources", "sources": sources})

            latency_ms = round((time.perf_counter() - t0) * 1000, 2)
            yield _sse_event({"type": "done", "trace_id": trace_id, "latency_ms": latency_ms})

        except Exception as exc:
            logger.error(
                "ask_stream_error",
                extra={"trace_id": trace_id, "error": str(exc)},
                exc_info=True,
            )
            yield _sse_event({"type": "error", "message": str(exc)})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Request-ID": trace_id,
        },
    )


# ── POST /ingest ──────────────────────────────────────────────────────────────


@router.post("/ingest", response_model=IngestResponse, tags=["rag"])
async def ingest(
    request: Request,
    file: UploadFile,
    metadata: str = Form(default="{}"),
) -> IngestResponse | JSONResponse:
    """
    Ingest a document into the vectorstore.

    Accepts multipart/form-data with a 'file' field (required) and
    optional 'metadata' field (JSON string of key-value pairs).
    File is saved to a temp path, ingested, then cleaned up — success or failure.
    python-multipart is required for UploadFile to work.
    """
    trace_id: str = getattr(request.state, "trace_id", new_trace_id())
    user_id: str = request.headers.get("X-User-ID", "anonymous")
    tmp_path: str | None = None

    # Rate limit ingest (stricter — 5/min per user)
    rate_result = ingest_rate_limiter.check(user_id, trace_id)
    if not rate_result.allowed:
        return JSONResponse(
            status_code=429,
            content={
                "error": "RATE_LIMITED",
                "message": f"Too many ingest requests. Try again in {rate_result.retry_after} seconds.",
                "retry_after": rate_result.retry_after,
            },
            headers={"Retry-After": str(rate_result.retry_after)},
        )

    try:
        import json as _json

        from rag.rag_interface import ingest as rag_ingest

        # Parse metadata JSON string from form field
        try:
            parsed_metadata: dict = _json.loads(metadata)
        except _json.JSONDecodeError:
            return _error_response(
                "invalid_metadata",
                "metadata field must be a valid JSON object string",
                trace_id,
                422,
            )

        # Save uploaded file to a temporary path
        suffix = os.path.splitext(file.filename or "upload")[1] or ".bin"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp_path = tmp.name
            content = await file.read()
            tmp.write(content)

        logger.info(
            "ingest_file_received",
            extra={
                "trace_id": trace_id,
                "file_name": file.filename,  # "filename" is reserved by Python logging.LogRecord
                "size_bytes": len(content),
                "tmp_path": tmp_path,
            },
        )

        enriched_metadata = {
            **parsed_metadata,
            "source": file.filename or tmp_path,
            "trace_id": trace_id,
        }

        result = rag_ingest(file_path=tmp_path, metadata=enriched_metadata)

        if result.get("error"):
            logger.error(
                "ingest_pipeline_error",
                extra={"trace_id": trace_id, "error": result["error"]},
            )
            return _error_response("ingest_failed", result["error"], trace_id, 500)

        return IngestResponse(
            status=result["status"],
            chunk_count=result["chunk_count"],
            document_id=enriched_metadata.get("document_id"),
            error=None,
        )

    except Exception as exc:
        logger.error(
            "ingest_unhandled_error",
            extra={"trace_id": trace_id, "error": str(exc)},
            exc_info=True,
        )
        return _error_response("ingest_failed", str(exc), trace_id, 500)

    finally:
        # Always clean up the temp file — success or failure
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


# ── GET /retrieve ─────────────────────────────────────────────────────────────


@router.get("/retrieve", response_model=RetrieveResponse, tags=["rag"])
async def retrieve(
    request: Request,
    query: str,
    top_k: int = 5,
    strategy: str = "semantic",
) -> RetrieveResponse | JSONResponse:
    """
    Retrieve document chunks without generating an answer.

    Useful for debugging the retrieval stage independently from generation,
    or for building UI features that show source documents before the answer.
    """
    trace_id: str = getattr(request.state, "trace_id", new_trace_id())
    tier_config = _resolve_tier(request)
    try:
        from rag.rag_interface import retrieve as rag_retrieve

        raw_chunks = await rag_retrieve(query=query, top_k=top_k, strategy=strategy, tier_config=tier_config)

        # Check if retrieve() returned an error list
        if raw_chunks and "error" in raw_chunks[0]:
            error_msg = raw_chunks[0]["error"]
            logger.error(
                "retrieve_error",
                extra={"trace_id": trace_id, "error": error_msg},
            )
            return _error_response("retrieve_failed", error_msg, trace_id, 500)

        chunks = [_normalize_source(c) for c in raw_chunks]
        return RetrieveResponse(chunks=chunks, trace_id=trace_id)

    except Exception as exc:
        logger.error(
            "retrieve_unhandled_error",
            extra={"trace_id": trace_id, "error": str(exc)},
            exc_info=True,
        )
        return _error_response("retrieve_failed", str(exc), trace_id, 500)


# ── POST /agent/run ───────────────────────────────────────────────────────────


@router.post("/agent/run", response_model=AgentRunResponse, tags=["agent"])
async def run_agent(body: AskRequest, request: Request) -> AgentRunResponse | JSONResponse:
    """
    Run the ReAct agent for a query.

    Always uses the agent pipeline — no auto-routing. Use POST /ask for routing.
    """
    trace_id: str = getattr(request.state, "trace_id", new_trace_id())
    user_id: str = request.headers.get("X-User-ID", "anonymous")
    tier_config = _resolve_tier(request)

    try:
        from agents.factory import create_agent

        rag = _RAGAdapter()
        doc_repo = _ChromaDocumentRepository()
        agent = create_agent(
            rag_interface=rag,
            documents_repository=doc_repo,
            tier_config=tier_config,
        )

        result = await agent.run(
            query=body.query,
            user_id=user_id,
            trace_id=trace_id,
            conversation_history=body.history or [],
            tier_config=tier_config,
        )

        return AgentRunResponse(
            answer=result.answer,
            steps=[
                AgentStepResponse(
                    step_number=s.step_number,
                    action=s.action,
                    action_input=s.action_input,
                    observation=s.observation,
                    is_final=s.is_final,
                    final_answer=s.final_answer,
                )
                for s in result.steps
            ],
            total_steps=result.total_steps,
            stopped_reason=result.stopped_reason,
            trace_id=trace_id,
        )

    except Exception as exc:
        logger.error(
            "agent_run_error", extra={"trace_id": trace_id, "error": str(exc)}, exc_info=True
        )
        return _error_response("agent_failed", str(exc), trace_id, 500)


# ── GET /cache/stats ──────────────────────────────────────────────────────────


@router.get("/cache/stats", tags=["system"])
async def cache_stats(request: Request) -> JSONResponse:
    """Return current cache hit rates and sizes."""
    from core.cache import llm_cache, retrieval_cache

    return JSONResponse(
        content={
            "retrieval": retrieval_cache.stats,
            "llm": llm_cache.stats,
        }
    )


# ── POST /cache/clear ─────────────────────────────────────────────────────────


@router.post("/cache/clear", tags=["system"])
async def cache_clear(request: Request) -> JSONResponse:
    """Clear all caches. Use after bulk document re-ingestion."""
    from core.cache import llm_cache, retrieval_cache

    retrieval_cache.clear()
    llm_cache.clear()
    return JSONResponse(content={"cleared": True})


# ── GET /metrics ──────────────────────────────────────────────────────────────


@router.get("/metrics", tags=["system"])
async def get_metrics(hours: int = 24) -> JSONResponse:
    """Return aggregated AI system metrics from structured logs."""
    from observability.metrics import compute_metrics

    metrics = compute_metrics(since_hours=hours)
    return JSONResponse(content=metrics)


# ── GET /memories ─────────────────────────────────────────────────────────────


@router.get("/memories", tags=["memory"])
async def list_memories(request: Request) -> JSONResponse:
    """List all long-term memories for the authenticated user."""
    trace_id: str = getattr(request.state, "trace_id", new_trace_id())
    user_id = request.headers.get("X-User-ID")
    if not user_id:
        return _error_response("missing_user_id", "X-User-ID header required", trace_id, 400)
    try:
        from memory.long_term_memory import LongTermMemoryStore

        store = LongTermMemoryStore()
        memories = await store.list_memories(user_id)
        return JSONResponse(content={"memories": memories, "count": len(memories)})
    except Exception as exc:
        logger.error(
            "list_memories_error", extra={"trace_id": trace_id, "error": str(exc)}, exc_info=True
        )
        return _error_response("list_memories_failed", str(exc), trace_id, 500)


# ── DELETE /memories/{memory_id} ──────────────────────────────────────────────


@router.delete("/memories/{memory_id}", tags=["memory"])
async def delete_memory_endpoint(memory_id: str, request: Request) -> JSONResponse:
    """Delete a specific memory. Verifies the memory belongs to the requesting user."""
    trace_id: str = getattr(request.state, "trace_id", new_trace_id())
    user_id = request.headers.get("X-User-ID")
    if not user_id:
        return _error_response("missing_user_id", "X-User-ID header required", trace_id, 400)
    try:
        from memory.long_term_memory import LongTermMemoryStore

        store = LongTermMemoryStore()
        deleted = await store.delete_memory(memory_id, user_id)
        if not deleted:
            return _error_response("not_found", "Memory not found or access denied", trace_id, 404)
        return JSONResponse(content={"deleted": True})
    except Exception as exc:
        logger.error(
            "delete_memory_error", extra={"trace_id": trace_id, "error": str(exc)}, exc_info=True
        )
        return _error_response("delete_memory_failed", str(exc), trace_id, 500)


# ── POST /memories/extract ────────────────────────────────────────────────────


@router.post("/memories/extract", tags=["memory"])
async def extract_and_store_memories(
    body: dict,
    request: Request,
    background_tasks: BackgroundTasks,
) -> JSONResponse:
    """
    Trigger async memory extraction from a conversation.
    Body: { user_id: str, messages: [{role, content}] }
    Returns immediately; extraction runs in background.
    """
    trace_id: str = getattr(request.state, "trace_id", new_trace_id())
    user_id = body.get("user_id")
    messages = body.get("messages", [])
    tier_config = _resolve_tier(request)

    if not user_id:
        return _error_response("missing_user_id", "user_id required in body", trace_id, 400)

    async def _extract_and_store() -> None:
        try:
            from memory.long_term_memory import LongTermMemoryStore
            from memory.memory_extractor import extract_memories

            facts = await extract_memories(messages, trace_id=trace_id, tier_config=tier_config)
            store = LongTermMemoryStore()
            for fact in facts:
                await store.store_memory(user_id, fact, trace_id=trace_id)
        except Exception as exc:
            logger.error(
                "background_memory_extraction_error",
                extra={"trace_id": trace_id, "error": str(exc)},
                exc_info=True,
            )

    background_tasks.add_task(_extract_and_store)
    return JSONResponse(content={"status": "extraction_started"})
