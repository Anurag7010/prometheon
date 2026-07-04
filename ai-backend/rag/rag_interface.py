"""
rag/rag_interface.py

Clean adapter over the multimodal RAG system.

Public API — three functions, no LangChain types leak out:
    ingest(file_path, metadata)           → {status, chunk_count, error}
    retrieve(query, top_k, strategy)      → list[{content, score, metadata}]
    ask(query, history, trace_id)         → {answer, sources, latency_breakdown, trace_id, error}
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import TYPE_CHECKING, Any

from core.config import config
from core.guardrails import check_query, sanitize_input, sanitize_output
from core.llm_client import complete_with_fallback
from observability.logger import get_logger, log_pipeline_event, log_retrieval
from observability.tracer import Tracer, new_trace_id
from rag.context_manager import build_context

if TYPE_CHECKING:
    from core.user_tier import TierConfig

logger = get_logger(__name__)

# ── Constants pulled from config — no magic values here ──────────────────────
_PERSIST_DIR = "external/rag_system/db/chroma_db"
_PERSIST_DIR_HF = "external/rag_system/db/chroma_db_hf"
_EMBED_MODEL = "text-embedding-3-small"

# ── Vectorstore singletons ────────────────────────────────────────────────────
_vectorstore_cache: Any = None
_vectorstore_hf_cache: Any = None


def _get_deps() -> dict[str, Any]:
    """Import all heavy RAG dependencies lazily. Raises ImportError with install hint."""
    try:
        from langchain_chroma import Chroma
        from langchain_core.documents import Document
        from langchain_core.messages import HumanMessage
        from langchain_openai import ChatOpenAI, OpenAIEmbeddings
        from unstructured.chunking.title import chunk_by_title
        from unstructured.partition.pdf import partition_pdf

        return {
            "partition_pdf": partition_pdf,
            "chunk_by_title": chunk_by_title,
            "Document": Document,
            "ChatOpenAI": ChatOpenAI,
            "OpenAIEmbeddings": OpenAIEmbeddings,
            "Chroma": Chroma,
            "HumanMessage": HumanMessage,
        }
    except ImportError as exc:
        raise ImportError(
            f"[rag_interface] Missing dependency: {exc}.\n"
            "Run: pip install unstructured[pdf] langchain-chroma langchain-openai"
        ) from exc


def _get_vectorstore(deps: dict) -> Any:
    """Return cached Chroma vectorstore, opening from disk on first access."""
    global _vectorstore_cache
    if _vectorstore_cache is not None:
        return _vectorstore_cache
    embedding_model = deps["OpenAIEmbeddings"](model=_EMBED_MODEL)
    _vectorstore_cache = deps["Chroma"](
        persist_directory=_PERSIST_DIR,
        embedding_function=embedding_model,
        collection_metadata={"hnsw:space": "cosine"},
    )
    logger.info(f"[rag] Opened vectorstore at {_PERSIST_DIR}")
    return _vectorstore_cache


def _invalidate_vectorstore() -> None:
    """Force vectorstore reload on next access (call after ingestion)."""
    global _vectorstore_cache
    _vectorstore_cache = None


def _get_vectorstore_hf(deps: dict) -> Any:
    """Return cached HuggingFace vectorstore, opening from disk on first access."""
    global _vectorstore_hf_cache
    if _vectorstore_hf_cache is not None:
        return _vectorstore_hf_cache
    from langchain_community.embeddings import HuggingFaceEmbeddings

    embedding_model = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    _vectorstore_hf_cache = deps["Chroma"](
        persist_directory=_PERSIST_DIR_HF,
        embedding_function=embedding_model,
        collection_name="langchain_hf",
        collection_metadata={"hnsw:space": "cosine"},
    )
    logger.info(f"[rag] Opened HuggingFace vectorstore at {_PERSIST_DIR_HF}")
    return _vectorstore_hf_cache


def _invalidate_vectorstore_hf() -> None:
    """Force HuggingFace vectorstore reload on next access."""
    global _vectorstore_hf_cache
    _vectorstore_hf_cache = None


def _get_vectorstore_for_tier(deps: dict, tier_config: Any = None) -> Any:
    """Return the correct vectorstore for the user's tier."""
    if tier_config is not None and not tier_config.is_owner:
        return _get_vectorstore_hf(deps)
    return _get_vectorstore(deps)


# ── Ingestion helpers ─────────────────────────────────────────────────────────


def _partition_document(file_path: str, deps: dict) -> list:
    """Partition a PDF into raw unstructured elements."""
    logger.info(f"[rag] Partitioning {file_path}")
    return deps["partition_pdf"](
        filename=file_path,
        strategy="hi_res",
        infer_table_structure=True,
        extract_image_block_types=["Image"],
        extract_image_block_to_payload=True,
    )


def _chunk_elements(elements: list, deps: dict) -> list:
    """Chunk unstructured elements using title-based splitting."""
    return deps["chunk_by_title"](
        elements,
        max_characters=config.DEFAULT_CHUNK_SIZE * 5,  # ~2500 chars
        new_after_n_chars=config.DEFAULT_CHUNK_SIZE * 4,
        combine_text_under_n_chars=config.DEFAULT_CHUNK_SIZE,
    )


def _separate_content_types(chunk: Any) -> dict:
    """Extract text, tables, and images from a single chunk object."""
    data: dict = {"text": chunk.text, "tables": [], "images": [], "types": ["text"]}
    if not (hasattr(chunk, "metadata") and hasattr(chunk.metadata, "orig_elements")):
        return data
    for element in chunk.metadata.orig_elements:
        etype = type(element).__name__
        if etype == "Table":
            data["types"].append("table")
            data["tables"].append(getattr(element.metadata, "text_as_html", element.text))
        elif etype == "Image":
            if hasattr(element, "metadata") and hasattr(element.metadata, "image_base64"):
                data["types"].append("image")
                data["images"].append(element.metadata.image_base64)
    data["types"] = list(set(data["types"]))
    return data


def _create_ai_summary(text: str, tables: list[str], images: list[str], deps: dict) -> str:
    """Generate an AI-enhanced searchable summary for a mixed-content chunk."""
    llm = deps["ChatOpenAI"](model=config.MODEL_NAME, temperature=0)
    prompt = (
        "Create a comprehensive, searchable description for retrieval.\n\n" f"TEXT:\n{text}\n\n"
    )
    if tables:
        prompt += (
            "TABLES:\n" + "\n".join(f"Table {i+1}:\n{t}" for i, t in enumerate(tables)) + "\n\n"
        )
    prompt += (
        "Describe key facts, topics, data, and questions this content answers.\n"
        "SEARCHABLE DESCRIPTION:"
    )
    message_content: list[dict] = [{"type": "text", "text": prompt}]
    for img in images:
        message_content.append(
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img}"}}
        )
    response = llm.invoke([deps["HumanMessage"](content=message_content)])
    return response.content


def _summarise_chunks(chunks: list, metadata: dict, deps: dict) -> list:
    """Convert raw chunks to LangChain Documents with AI-enhanced page_content."""
    documents = []
    for i, chunk in enumerate(chunks):
        content_data = _separate_content_types(chunk)
        has_rich = bool(content_data["tables"] or content_data["images"])
        if has_rich:
            try:
                enhanced = _create_ai_summary(
                    content_data["text"], content_data["tables"], content_data["images"], deps
                )
            except Exception as exc:
                logger.warning(f"[rag] AI summary failed chunk {i}: {exc}")
                enhanced = content_data["text"]
        else:
            enhanced = content_data["text"]

        documents.append(
            deps["Document"](
                page_content=enhanced,
                metadata={
                    **metadata,
                    "chunk_index": i,
                    "original_content": json.dumps(
                        {
                            "raw_text": content_data["text"],
                            "tables_html": content_data["tables"],
                            "images_base64": content_data["images"],
                        }
                    ),
                },
            )
        )
    return documents


def _store_documents(documents: list, deps: dict) -> None:
    """Persist LangChain Documents into both ChromaDB collections (OpenAI + HuggingFace)."""
    # Owner collection — OpenAI embeddings
    embedding_model_openai = deps["OpenAIEmbeddings"](model=_EMBED_MODEL)
    deps["Chroma"].from_documents(
        documents=documents,
        embedding=embedding_model_openai,
        persist_directory=_PERSIST_DIR,
        collection_metadata={"hnsw:space": "cosine"},
    )
    logger.info(f"[rag] Stored {len(documents)} docs in OpenAI vectorstore")

    # Free-tier collection — HuggingFace local embeddings (no API cost)
    try:
        from langchain_community.embeddings import HuggingFaceEmbeddings

        embedding_model_hf = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        deps["Chroma"].from_documents(
            documents=documents,
            embedding=embedding_model_hf,
            persist_directory=_PERSIST_DIR_HF,
            collection_name="langchain_hf",
            collection_metadata={"hnsw:space": "cosine"},
        )
        logger.info(f"[rag] Stored {len(documents)} docs in HuggingFace vectorstore")
    except Exception as exc:
        # Log but don't fail ingest — owner can still use OpenAI collection
        logger.warning(f"[rag] HuggingFace vectorstore ingest failed (non-fatal): {exc}")

    # Invalidate both caches — only reached when OpenAI write succeeded
    _invalidate_vectorstore()
    _invalidate_vectorstore_hf()


# ── Retrieval helpers ─────────────────────────────────────────────────────────


def _retrieve_semantic(query: str, top_k: int, vectorstore: Any) -> list:
    """Standard dense semantic retrieval — returns Documents with score injected into metadata."""
    pairs = vectorstore.similarity_search_with_score(query, k=top_k)
    docs = []
    for doc, score in pairs:
        # Cosine distance from ChromaDB → similarity (lower distance = higher similarity)
        doc.metadata["score"] = round(1.0 - float(score), 4)
        docs.append(doc)
    return docs


def _retrieve_mmr(query: str, top_k: int, vectorstore: Any) -> list:
    """MMR retrieval — reduces redundancy; injects placeholder score so filter_by_score passes."""
    docs = vectorstore.max_marginal_relevance_search(query, k=top_k, fetch_k=top_k * 2)
    for doc in docs:
        if "score" not in doc.metadata:
            doc.metadata["score"] = 0.75  # MMR doesn't expose scores; assume above threshold
    return docs


def _retrieve_hybrid(query: str, top_k: int, vectorstore: Any) -> list:
    """Hybrid dense + BM25 retrieval with ensemble; falls back to semantic."""
    try:
        from langchain.retrievers import EnsembleRetriever
        from langchain_community.retrievers import BM25Retriever
        from langchain_core.documents import Document as LCDoc

        all_docs = vectorstore.get()["documents"]
        if not all_docs:
            return _retrieve_semantic(query, top_k, vectorstore)
        bm25 = BM25Retriever.from_documents([LCDoc(page_content=d) for d in all_docs])
        bm25.k = top_k
        ensemble = EnsembleRetriever(
            retrievers=[vectorstore.as_retriever(search_kwargs={"k": top_k}), bm25],
            weights=[0.5, 0.5],
        )
        return ensemble.invoke(query)
    except ImportError:
        logger.warning("[rag] BM25 unavailable — falling back to semantic")
        return _retrieve_semantic(query, top_k, vectorstore)


def _retrieve_multi_query(query: str, top_k: int, vectorstore: Any, deps: dict) -> list:
    """Multi-query retrieval with LLM-generated query variants."""
    try:
        from langchain.retrievers.multi_query import MultiQueryRetriever

        llm = deps["ChatOpenAI"](model=config.MODEL_NAME, temperature=0)
        mq = MultiQueryRetriever.from_llm(
            retriever=vectorstore.as_retriever(search_kwargs={"k": top_k}),
            llm=llm,
        )
        return mq.invoke(query)
    except Exception as exc:
        logger.warning(f"[rag] Multi-query failed: {exc} — falling back to semantic")
        return _retrieve_semantic(query, top_k, vectorstore)


def _retrieve_rrf(query: str, top_k: int, vectorstore: Any) -> list:
    """Reciprocal Rank Fusion over semantic + MMR result lists."""
    RRF_K = 60
    semantic = _retrieve_semantic(query, top_k * 2, vectorstore)
    mmr = _retrieve_mmr(query, top_k * 2, vectorstore)
    scores: dict[str, float] = {}
    doc_map: dict[str, Any] = {}
    for rank, doc in enumerate(semantic):
        key = doc.page_content[:100]
        scores[key] = scores.get(key, 0.0) + 1.0 / (rank + RRF_K)
        doc_map[key] = doc
    for rank, doc in enumerate(mmr):
        key = doc.page_content[:100]
        scores[key] = scores.get(key, 0.0) + 1.0 / (rank + RRF_K)
        doc_map[key] = doc
    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return [doc_map[k] for k, _ in ranked[:top_k]]


def _normalize_docs(docs: list) -> list[dict]:
    """Convert LangChain Document list → plain dicts. Nothing LangChain leaks out."""
    results = []
    for doc in docs:
        try:
            original = json.loads(doc.metadata.get("original_content", "{}"))
        except (json.JSONDecodeError, TypeError):
            original = {}
        results.append(
            {
                "content": doc.page_content,
                "score": doc.metadata.get("score", None),
                "metadata": {
                    "source": doc.metadata.get("source", "unknown"),
                    "chunk_index": doc.metadata.get("chunk_index", None),
                    "has_tables": bool(original.get("tables_html")),
                    "has_images": bool(original.get("images_base64")),
                },
            }
        )
    return results


def _build_context_text(docs: list) -> tuple[str, list[str]]:
    """Build a formatted context string and deduplicated source list from raw docs."""
    parts, sources = [], []
    for i, doc in enumerate(docs):
        try:
            original = json.loads(doc.metadata.get("original_content", "{}"))
        except (json.JSONDecodeError, TypeError):
            original = {}
        section = f"--- Document {i + 1} ---\n"
        raw_text = original.get("raw_text", "") or doc.page_content
        if raw_text:
            section += f"TEXT:\n{raw_text}\n\n"
        for j, table in enumerate(original.get("tables_html", [])):
            section += f"TABLE {j + 1}:\n{table}\n\n"
        parts.append(section)
        sources.append(doc.metadata.get("source", f"chunk_{i}"))
    return "\n".join(parts), list(dict.fromkeys(sources))


def _generate_answer(query: str, docs: list, history: list | None, deps: dict) -> str:
    """Generate a multimodal LLM answer from retrieved docs and optional chat history."""
    from langchain_core.messages import AIMessage
    from langchain_core.messages import HumanMessage as HM

    context_text, _ = _build_context_text(docs)
    prompt = f"Based on the following documents, answer: {query}\n\n" f"{context_text}\n\nANSWER:"
    message_content: list[dict] = [{"type": "text", "text": prompt}]
    for doc in docs:
        try:
            original = json.loads(doc.metadata.get("original_content", "{}"))
        except (json.JSONDecodeError, TypeError):
            original = {}
        for img in original.get("images_base64", []):
            message_content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{img}"},
                }
            )
    messages = []
    if history:
        for turn in history:
            if turn.get("role") == "user":
                messages.append(HM(content=turn["content"]))
            elif turn.get("role") == "assistant":
                messages.append(AIMessage(content=turn["content"]))
    messages.append(deps["HumanMessage"](content=message_content))
    llm = deps["ChatOpenAI"](model=config.MODEL_NAME, temperature=config.TEMPERATURE)
    return llm.invoke(messages).content or ""


# ── Score filtering & quality metrics ────────────────────────────────────────

# Canonical answer when retrieval finds nothing — shared by ask() and /ask/stream
# so both paths tell the user the same honest thing instead of hallucinating.
NO_RESULTS_ANSWER = (
    "I couldn't find relevant information in the provided documents to answer your question."
)


def filter_by_score(chunks: list[dict], threshold: float) -> list[dict]:
    """Filter out chunks below the relevance threshold. Empty is better than misleading."""
    return [c for c in chunks if c.get("score") is not None and c.get("score", 0) >= threshold]


def compute_retrieval_quality(chunks: list[dict]) -> dict:
    """Compute quality metrics for a retrieval result."""
    if not chunks:
        return {"quality": "no_results", "max_score": 0.0, "avg_score": 0.0, "chunk_count": 0}
    scores = [c.get("score", 0) for c in chunks]
    return {
        "quality": "good" if max(scores) >= 0.8 else "fair" if max(scores) >= 0.65 else "poor",
        "max_score": round(max(scores), 3),
        "avg_score": round(sum(scores) / len(scores), 3),
        "chunk_count": len(chunks),
    }


async def _generate_query_variants(
    query: str, trace_id: str = None, tier_config: Any = None
) -> list[str]:
    """Generate 3 alternative phrasings of the query using the LLM. Falls back to [query] on failure."""
    result = await complete_with_fallback(
        prompt_name="query_variants",
        user_vars={"query": query},
        trace_id=trace_id,
        tier_config=tier_config,
    )
    if result["success"] and isinstance(result["data"], list):
        variants = result["data"][:3]
        return [query] + variants  # original + variants
    return [query]  # fallback: original only


def _retrieve_single(query: str, top_k: int, strategy: str, tier_config: Any = None) -> list[dict]:
    """Retrieve chunks for a single query using the given strategy and tier-appropriate vectorstore."""
    deps = _get_deps()
    vectorstore = _get_vectorstore_for_tier(deps, tier_config)
    strategy_map = {
        "semantic": lambda: _retrieve_semantic(query, top_k, vectorstore),
        "hybrid": lambda: _retrieve_hybrid(query, top_k, vectorstore),
        "multi_query": lambda: _retrieve_multi_query(query, top_k, vectorstore, deps),
        "rrf": lambda: _retrieve_rrf(query, top_k, vectorstore),
    }
    if strategy not in strategy_map:
        raise ValueError(f"Unknown strategy '{strategy}'. Choose: {list(strategy_map)}")
    docs = strategy_map[strategy]()
    result = _normalize_docs(docs)

    # Fallback: if free-tier HF store returns nothing, try OpenAI store.
    # Handles documents ingested before dual-write was deployed.
    if not result and tier_config is not None and not tier_config.is_owner:
        logger.info("[rag] HF vectorstore empty, falling back to OpenAI vectorstore")
        fallback_vs = _get_vectorstore(deps)
        fallback_strategy_map = {
            "semantic": lambda: _retrieve_semantic(query, top_k, fallback_vs),
            "hybrid": lambda: _retrieve_hybrid(query, top_k, fallback_vs),
            "multi_query": lambda: _retrieve_multi_query(query, top_k, fallback_vs, deps),
            "rrf": lambda: _retrieve_rrf(query, top_k, fallback_vs),
        }
        docs = fallback_strategy_map[strategy]()
        result = _normalize_docs(docs)

    return result


# ── Public API ────────────────────────────────────────────────────────────────


def ingest(file_path: str, metadata: dict | None = None) -> dict:
    """
    Ingest a PDF into the vector store.

    Returns:
        {status: "ok"|"error", chunk_count: int, error: str|None}
    """
    metadata = {**(metadata or {}), "source": (metadata or {}).get("source", file_path)}
    try:
        deps = _get_deps()
        elements = _partition_document(file_path, deps)
        chunks = _chunk_elements(elements, deps)
        documents = _summarise_chunks(chunks, metadata, deps)
        _store_documents(documents, deps)  # invalidates both caches internally
        return {"status": "ok", "chunk_count": len(documents), "error": None}
    except Exception as exc:
        logger.error(f"[rag] ingest failed: {exc}")
        return {"status": "error", "chunk_count": 0, "error": str(exc)}


async def retrieve(
    query: str,
    top_k: int = 0,
    strategy: str = "",
    use_multi_query: bool = False,
    trace_id: str | None = None,
    tier_config: Any = None,
) -> list[dict]:
    """
    Retrieve relevant document chunks for a query.

    Returns list of {content, score, metadata} dicts.
    On error: [{error: str}]
    """
    resolved_top_k = top_k or config.DEFAULT_TOP_K
    resolved_strategy = strategy or config.DEFAULT_RETRIEVAL_STRATEGY

    # Sanitize input
    query = sanitize_input(query)

    from core.cache import make_cache_key, retrieval_cache

    cache_key = make_cache_key(
        query=query, top_k=resolved_top_k, strategy=resolved_strategy,
        tier=tier_config.tier.value if tier_config else ""
    )
    cached = retrieval_cache.get(cache_key)
    if cached is not None:
        log_pipeline_event(
            event="cache_hit",
            trace_id=trace_id or "no_trace",
            metadata={"cache": "retrieval", "key": cache_key[:8]},
        )
        return cached

    log_pipeline_event(
        event="cache_miss",
        trace_id=trace_id or "no_trace",
        metadata={"cache": "retrieval", "key": cache_key[:8]},
    )

    try:
        if use_multi_query:
            queries = await _generate_query_variants(query, trace_id, tier_config)
        else:
            queries = [query]

        all_chunks: list[dict] = []
        seen_ids: set[str] = set()

        for q in queries:
            chunks = await asyncio.to_thread(
                _retrieve_single, q, resolved_top_k, resolved_strategy, tier_config
            )
            for chunk in chunks:
                chunk_id = (
                    chunk.get("metadata", {}).get("chunk_id") or chunk.get("content", "")[:50]
                )
                if chunk_id not in seen_ids:
                    seen_ids.add(chunk_id)
                    all_chunks.append(chunk)

        # Sort by score descending, take top_k
        all_chunks.sort(key=lambda c: c.get("score") or 0, reverse=True)
        all_chunks = all_chunks[:resolved_top_k]

        # Filter by relevance threshold
        result = filter_by_score(all_chunks, config.RELEVANCE_THRESHOLD)

        retrieval_cache.set(cache_key, result)
        return result

    except Exception as exc:
        logger.error(f"[rag] retrieve failed: {exc}")
        return [{"error": str(exc)}]


async def ask(
    query: str,
    history: list[dict] | None = None,
    user_id: str | None = None,
    trace_id: str | None = None,
    tier_config: Any = None,
) -> dict:
    """
    Full RAG pipeline: guardrail check → retrieve → filter → build context → generate answer.

    Returns:
        {answer, sources, latency_breakdown, trace_id, error,
         guardrail_rejected, no_results, retrieval_quality}
    """
    tid = trace_id or new_trace_id()
    log_pipeline_event(event="pipeline_start", trace_id=tid, metadata={"query": query[:120]})

    # Load and trim conversation history via ConversationBuffer
    from memory.conversation_buffer import ConversationBuffer

    buffer = ConversationBuffer(max_tokens=2000, strategy="window")
    if history:
        buffer.load_from_db(
            [{"role": m["role"], "content": m["content"], "token_count": 0} for m in history]
        )
        buffer.trim(tid)
    effective_history = buffer.to_messages()

    retrieval_ms = 0.0
    generation_ms = 0.0
    t_total = time.perf_counter()

    try:
        # Step 1: Guardrail check
        guardrail_result = await check_query(query, trace_id=tid)
        if not guardrail_result.passed:
            total_ms = (time.perf_counter() - t_total) * 1000
            return {
                "answer": guardrail_result.reason,
                "sources": [],
                "trace_id": tid,
                "latency_breakdown": {
                    "retrieval_ms": 0.0,
                    "generation_ms": 0.0,
                    "total_ms": round(total_ms, 2),
                },
                "error": None,
                "guardrail_rejected": True,
                "no_results": False,
                "retrieval_quality": {
                    "quality": "no_results",
                    "max_score": 0.0,
                    "avg_score": 0.0,
                    "chunk_count": 0,
                },
            }

        # Use sanitized query from guardrail
        sanitized_query = guardrail_result.sanitized_query

        # Retrieve long-term memories for this user if user_id is provided
        memory_context = ""
        if user_id:
            from memory.long_term_memory import LongTermMemoryStore

            store = LongTermMemoryStore()
            memories = await store.retrieve_memories(
                user_id=user_id,
                query=sanitized_query,
                top_k=5,
                trace_id=tid,
            )
            if memories:
                facts = "\n".join(f"- {m['content']}" for m in memories)
                memory_context = f"What you know about this user:\n{facts}"

        # Step 2: Retrieval with score-threshold filtering
        with Tracer("retrieval", trace_id=tid) as tr:
            chunks = await retrieve(sanitized_query, trace_id=tid, tier_config=tier_config)
        retrieval_ms = tr.latency_ms

        quality = compute_retrieval_quality(chunks)
        log_retrieval(
            trace_id=tid,
            query=sanitized_query,
            strategy=config.DEFAULT_RETRIEVAL_STRATEGY,
            top_k=config.DEFAULT_TOP_K,
            result_count=len(chunks),
            latency_ms=retrieval_ms,
        )

        # Step 3: Check if retrieval found anything
        if not chunks:
            total_ms = (time.perf_counter() - t_total) * 1000
            log_pipeline_event(
                event="pipeline_end",
                trace_id=tid,
                metadata={"total_ms": round(total_ms, 2), "status": "no_results"},
            )
            return {
                "answer": NO_RESULTS_ANSWER,
                "sources": [],
                "trace_id": tid,
                "latency_breakdown": {
                    "retrieval_ms": round(retrieval_ms, 2),
                    "generation_ms": 0.0,
                    "total_ms": round(total_ms, 2),
                },
                "error": None,
                "guardrail_rejected": False,
                "no_results": True,
                "retrieval_quality": quality,
            }

        # Step 4: Build context (token-aware, with citation_ids)
        context_string, used_chunks = build_context(chunks, max_tokens=3000)

        # Prepend user memory context if available
        if memory_context:
            context_string = f"{memory_context}\n\n{context_string}"

        # Step 5: LLM cache check
        from core.cache import llm_cache
        from core.cache import make_cache_key as _make_key

        llm_cache_key = _make_key(
            query=sanitized_query,
            strategy=config.DEFAULT_RETRIEVAL_STRATEGY,
            history=effective_history,
            tier=tier_config.tier.value if tier_config else "",
        )
        cached_answer = llm_cache.get(llm_cache_key)
        if cached_answer is not None:
            log_pipeline_event(
                event="cache_hit", trace_id=tid, metadata={"cache": "llm", "key": llm_cache_key[:8]}
            )
            total_ms = (time.perf_counter() - t_total) * 1000
            log_pipeline_event(
                event="pipeline_end",
                trace_id=tid,
                metadata={"total_ms": round(total_ms, 2), "status": "ok"},
            )
            return {
                "answer": cached_answer,
                "sources": used_chunks,
                "trace_id": tid,
                "latency_breakdown": {
                    "retrieval_ms": round(retrieval_ms, 2),
                    "generation_ms": 0.0,
                    "total_ms": round(total_ms, 2),
                },
                "error": None,
                "guardrail_rejected": False,
                "no_results": False,
                "retrieval_quality": quality,
            }

        log_pipeline_event(
            event="cache_miss", trace_id=tid, metadata={"cache": "llm", "key": llm_cache_key[:8]}
        )

        # Step 6: Generate answer using PromptRegistry
        # Prepend conversation history to context if available so the LLM has turn context
        gen_context = context_string
        if effective_history:
            history_text = "\n".join(
                f"{m['role'].upper()}: {m['content']}" for m in effective_history
            )
            gen_context = f"Conversation history:\n{history_text}\n\n{gen_context}"
        with Tracer("generation", trace_id=tid) as tg:
            gen_result = await complete_with_fallback(
                prompt_name="qa",
                user_vars={"context": gen_context, "question": sanitized_query},
                trace_id=tid,
                tier_config=tier_config,
            )
        generation_ms = tg.latency_ms

        if gen_result["success"]:
            answer = sanitize_output(gen_result["data"])
        else:
            answer = "I was unable to generate a response. Please try again."

        llm_cache.set(llm_cache_key, answer)

        total_ms = (time.perf_counter() - t_total) * 1000
        log_pipeline_event(
            event="pipeline_end", trace_id=tid, metadata={"total_ms": round(total_ms, 2), "status": "ok"}
        )

        return {
            "answer": answer,
            "sources": used_chunks,
            "trace_id": tid,
            "latency_breakdown": {
                "retrieval_ms": round(retrieval_ms, 2),
                "generation_ms": round(generation_ms, 2),
                "total_ms": round(total_ms, 2),
            },
            "error": None,
            "guardrail_rejected": False,
            "no_results": False,
            "retrieval_quality": quality,
        }

    except Exception as exc:
        total_ms = (time.perf_counter() - t_total) * 1000
        logger.error(f"[rag] ask failed: {exc}")
        log_pipeline_event(
            event="pipeline_end",
            trace_id=tid,
            metadata={"total_ms": round(total_ms, 2), "status": "error", "error": str(exc)},
        )
        return {
            "answer": "",
            "sources": [],
            "latency_breakdown": {
                "retrieval_ms": round(retrieval_ms, 2),
                "generation_ms": round(generation_ms, 2),
                "total_ms": round(total_ms, 2),
            },
            "trace_id": tid,
            "error": str(exc),
            "guardrail_rejected": False,
            "no_results": False,
            "retrieval_quality": {
                "quality": "no_results",
                "max_score": 0.0,
                "avg_score": 0.0,
                "chunk_count": 0,
            },
        }
