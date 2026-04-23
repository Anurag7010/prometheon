"""
rag/rag_interface.py

Clean adapter over the multimodal RAG system.

Public API — three functions, no LangChain types leak out:
    ingest(file_path, metadata)           → {status, chunk_count, error}
    retrieve(query, top_k, strategy)      → list[{content, score, metadata}]
    ask(query, history, trace_id)         → {answer, sources, latency_breakdown, trace_id, error}
"""

import json
import time
from typing import Any

from core.config import config
from observability.logger import get_logger, log_retrieval, log_pipeline_event
from observability.tracer import Tracer, new_trace_id

logger = get_logger(__name__)

# ── Constants pulled from config — no magic values here ──────────────────────
_PERSIST_DIR = "external/rag_system/db/chroma_db"
_EMBED_MODEL  = "text-embedding-3-small"

# ── Vectorstore singleton ─────────────────────────────────────────────────────
_vectorstore_cache: Any = None


def _get_deps() -> dict[str, Any]:
    """Import all heavy RAG dependencies lazily. Raises ImportError with install hint."""
    try:
        from unstructured.partition.pdf import partition_pdf
        from unstructured.chunking.title import chunk_by_title
        from langchain_core.documents import Document
        from langchain_openai import ChatOpenAI, OpenAIEmbeddings
        from langchain_chroma import Chroma
        from langchain_core.messages import HumanMessage
        return {
            "partition_pdf":  partition_pdf,
            "chunk_by_title": chunk_by_title,
            "Document":       Document,
            "ChatOpenAI":     ChatOpenAI,
            "OpenAIEmbeddings": OpenAIEmbeddings,
            "Chroma":         Chroma,
            "HumanMessage":   HumanMessage,
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
        "Create a comprehensive, searchable description for retrieval.\n\n"
        f"TEXT:\n{text}\n\n"
    )
    if tables:
        prompt += "TABLES:\n" + "\n".join(
            f"Table {i+1}:\n{t}" for i, t in enumerate(tables)
        ) + "\n\n"
    prompt += (
        "Describe key facts, topics, data, and questions this content answers.\n"
        "SEARCHABLE DESCRIPTION:"
    )
    message_content: list[dict] = [{"type": "text", "text": prompt}]
    for img in images:
        message_content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img}"}})
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

        documents.append(deps["Document"](
            page_content=enhanced,
            metadata={
                **metadata,
                "chunk_index": i,
                "original_content": json.dumps({
                    "raw_text":    content_data["text"],
                    "tables_html": content_data["tables"],
                    "images_base64": content_data["images"],
                }),
            },
        ))
    return documents


def _store_documents(documents: list, deps: dict) -> None:
    """Persist LangChain Documents into ChromaDB."""
    embedding_model = deps["OpenAIEmbeddings"](model=_EMBED_MODEL)
    deps["Chroma"].from_documents(
        documents=documents,
        embedding=embedding_model,
        persist_directory=_PERSIST_DIR,
        collection_metadata={"hnsw:space": "cosine"},
    )
    logger.info(f"[rag] Stored {len(documents)} docs in vectorstore")


# ── Retrieval helpers ─────────────────────────────────────────────────────────

def _retrieve_semantic(query: str, top_k: int, vectorstore: Any) -> list:
    """Standard dense semantic retrieval."""
    return vectorstore.as_retriever(search_kwargs={"k": top_k}).invoke(query)


def _retrieve_mmr(query: str, top_k: int, vectorstore: Any) -> list:
    """MMR retrieval — reduces redundancy in results."""
    return vectorstore.max_marginal_relevance_search(query, k=top_k, fetch_k=top_k * 2)


def _retrieve_hybrid(query: str, top_k: int, vectorstore: Any) -> list:
    """Hybrid dense + BM25 retrieval with ensemble; falls back to semantic."""
    try:
        from langchain_community.retrievers import BM25Retriever
        from langchain.retrievers import EnsembleRetriever
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
        mq  = MultiQueryRetriever.from_llm(
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
    mmr      = _retrieve_mmr(query, top_k * 2, vectorstore)
    scores: dict[str, float] = {}
    doc_map: dict[str, Any]  = {}
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
        results.append({
            "content": doc.page_content,
            "score":   doc.metadata.get("score", None),
            "metadata": {
                "source":      doc.metadata.get("source", "unknown"),
                "chunk_index": doc.metadata.get("chunk_index", None),
                "has_tables":  bool(original.get("tables_html")),
                "has_images":  bool(original.get("images_base64")),
            },
        })
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
    from langchain_core.messages import HumanMessage as HM, AIMessage
    context_text, _ = _build_context_text(docs)
    prompt = (
        f"Based on the following documents, answer: {query}\n\n"
        f"{context_text}\n\nANSWER:"
    )
    message_content: list[dict] = [{"type": "text", "text": prompt}]
    for doc in docs:
        try:
            original = json.loads(doc.metadata.get("original_content", "{}"))
        except (json.JSONDecodeError, TypeError):
            original = {}
        for img in original.get("images_base64", []):
            message_content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{img}"},
            })
    messages = []
    if history:
        for turn in history:
            if turn.get("role") == "user":
                messages.append(HM(content=turn["content"]))
            elif turn.get("role") == "assistant":
                messages.append(AIMessage(content=turn["content"]))
    messages.append(deps["HumanMessage"](content=message_content))
    llm = deps["ChatOpenAI"](model=config.MODEL_NAME, temperature=config.TEMPERATURE)
    return llm.invoke(messages).content


# ── Public API ────────────────────────────────────────────────────────────────

def ingest(file_path: str, metadata: dict | None = None) -> dict:
    """
    Ingest a PDF into the vector store.

    Returns:
        {status: "ok"|"error", chunk_count: int, error: str|None}
    """
    metadata = {**(metadata or {}), "source": (metadata or {}).get("source", file_path)}
    try:
        deps      = _get_deps()
        elements  = _partition_document(file_path, deps)
        chunks    = _chunk_elements(elements, deps)
        documents = _summarise_chunks(chunks, metadata, deps)
        _store_documents(documents, deps)
        _invalidate_vectorstore()
        return {"status": "ok", "chunk_count": len(documents), "error": None}
    except Exception as exc:
        logger.error(f"[rag] ingest failed: {exc}")
        return {"status": "error", "chunk_count": 0, "error": str(exc)}


def retrieve(
    query:    str,
    top_k:    int = 0,
    strategy: str = "",
) -> list[dict]:
    """
    Retrieve relevant document chunks for a query.

    Returns:
        list of {content, score, metadata} dicts.
        On error: [{error: str}]
    """
    resolved_top_k    = top_k    or config.DEFAULT_TOP_K
    resolved_strategy = strategy or config.DEFAULT_RETRIEVAL_STRATEGY
    try:
        deps        = _get_deps()
        vectorstore = _get_vectorstore(deps)
        strategy_map = {
            "semantic":    lambda: _retrieve_semantic(query, resolved_top_k, vectorstore),
            "hybrid":      lambda: _retrieve_hybrid(query, resolved_top_k, vectorstore),
            "multi_query": lambda: _retrieve_multi_query(query, resolved_top_k, vectorstore, deps),
            "rrf":         lambda: _retrieve_rrf(query, resolved_top_k, vectorstore),
        }
        if resolved_strategy not in strategy_map:
            raise ValueError(
                f"Unknown strategy '{resolved_strategy}'. Choose: {list(strategy_map)}"
            )
        docs = strategy_map[resolved_strategy]()
        return _normalize_docs(docs)
    except Exception as exc:
        logger.error(f"[rag] retrieve failed: {exc}")
        return [{"error": str(exc)}]


def ask(
    query:    str,
    history:  list[dict] | None = None,
    trace_id: str | None        = None,
) -> dict:
    """
    Full RAG pipeline: retrieve → build context → generate answer.

    Returns:
        {answer, sources, latency_breakdown, trace_id, error}
    """
    tid = trace_id or new_trace_id()
    log_pipeline_event(event="pipeline_start", trace_id=tid, metadata={"query": query[:120]})

    retrieval_ms   = 0.0
    generation_ms  = 0.0
    t_total        = time.perf_counter()

    try:
        deps        = _get_deps()
        vectorstore = _get_vectorstore(deps)

        # Retrieval
        with Tracer("retrieval", trace_id=tid) as tr:
            docs = _retrieve_semantic(query, config.DEFAULT_TOP_K, vectorstore)
        retrieval_ms = tr.latency_ms

        _, sources = _build_context_text(docs)
        log_retrieval(
            trace_id=tid, query=query,
            strategy=config.DEFAULT_RETRIEVAL_STRATEGY,
            top_k=config.DEFAULT_TOP_K,
            result_count=len(docs), latency_ms=retrieval_ms,
        )

        # Generation
        with Tracer("generation", trace_id=tid) as tg:
            answer = _generate_answer(query, docs, history, deps)
        generation_ms = tg.latency_ms

        total_ms = (time.perf_counter() - t_total) * 1000
        log_pipeline_event(event="pipeline_end", trace_id=tid, metadata={
            "total_ms": round(total_ms, 2), "status": "ok"
        })

        return {
            "answer":  answer,
            "sources": sources,
            "latency_breakdown": {
                "retrieval_ms":  round(retrieval_ms, 2),
                "generation_ms": round(generation_ms, 2),
                "total_ms":      round(total_ms, 2),
            },
            "trace_id": tid,
            "error":    None,
        }

    except Exception as exc:
        total_ms = (time.perf_counter() - t_total) * 1000
        logger.error(f"[rag] ask failed: {exc}")
        log_pipeline_event(event="pipeline_end", trace_id=tid,
                           metadata={"total_ms": round(total_ms, 2), "status": "error", "error": str(exc)})
        return {
            "answer":  "",
            "sources": [],
            "latency_breakdown": {
                "retrieval_ms":  round(retrieval_ms, 2),
                "generation_ms": round(generation_ms, 2),
                "total_ms":      round(total_ms, 2),
            },
            "trace_id": tid,
            "error":    str(exc),
        }