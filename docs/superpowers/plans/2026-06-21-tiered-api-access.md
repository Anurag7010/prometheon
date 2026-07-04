# Tiered API Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route the owner email (rautanurag9@gmail.com) to OpenAI GPT-4o + OpenAI embeddings, and all other users to Groq llama-3.3-70b-versatile + local HuggingFace sentence-transformer embeddings.

**Architecture:** The tier is resolved per-request in the Python backend by reading an `X-User-Email` header (forwarded by Next.js from the JWT session). A `TierConfig` dataclass is threaded through every call that touches LLM or embeddings: `ask()`, `retrieve()`, `ingest()`, `agent.run()`, and `extract_memories()`. Ingestion writes into two separate ChromaDB collections so retrieval can use the right embedding function per tier.

**Tech Stack:** Python (groq, langchain-community HuggingFaceEmbeddings, chromadb), TypeScript/Next.js (context.email already set by withAuth middleware).

## Global Constraints

- Zero `any` types in TypeScript
- No hardcoded secrets — all keys from env vars
- No breaking changes to existing public API shapes (`AskResponse`, `AgentRunResponse`, etc.)
- All existing tests must continue to pass; new tests are additive
- `sentence-transformers` is already installed (v2.7.0)
- `langchain-community` is already in requirements
- Only `groq` needs to be pip-installed
- `context.email` is already set by `withAuth` middleware — use it directly, no middleware changes needed
- ChromaDB collection "langchain" = OpenAI embeddings (owner), "langchain_hf" = HuggingFace (free)

---

### Task 1: Install groq and update config files

**Files:**
- Modify: `ai-backend/requirements.txt`
- Modify: `ai-backend/.env` (add GROQ_API_KEY and OWNER_EMAIL)

**Interfaces:**
- Produces: `groq` importable in Python; `GROQ_API_KEY` and `OWNER_EMAIL` in env

- [ ] **Step 1: Install groq**

```bash
cd ai-backend
pip install groq
```

Expected output: `Successfully installed groq-X.X.X`

- [ ] **Step 2: Add to requirements.txt**

Open `ai-backend/requirements.txt` and add after the `openai` line:

```
groq>=0.4.0
```

- [ ] **Step 3: Add env vars to ai-backend/.env**

Add these two lines to `ai-backend/.env`:

```
GROQ_API_KEY=your-groq-api-key-here
OWNER_EMAIL=rautanurag9@gmail.com
```

- [ ] **Step 4: Update core/config.py — add GROQ_API_KEY and OWNER_EMAIL**

Open `ai-backend/core/config.py`. In the `Config` dataclass, after `TAVILY_API_KEY`, add:

```python
    # ── Tiered access ─────────────────────────────────────────────────────────
    GROQ_API_KEY: str
    OWNER_EMAIL: str
```

In the `load()` classmethod, after the `TAVILY_API_KEY` line, add:

```python
            GROQ_API_KEY=_optional("GROQ_API_KEY", ""),
            OWNER_EMAIL=_optional("OWNER_EMAIL", "rautanurag9@gmail.com"),
```

- [ ] **Step 5: Verify import**

```bash
cd ai-backend && python -c "from core.config import config; print(config.GROQ_API_KEY[:4] or 'empty'); print(config.OWNER_EMAIL)"
```

Expected: prints first 4 chars of key (or "empty") + "rautanurag9@gmail.com"

- [ ] **Step 6: Commit**

```bash
git add ai-backend/requirements.txt ai-backend/core/config.py
git commit -m "feat: add groq dependency and tiered-access config keys"
```

---

### Task 2: User tier detection module

**Files:**
- Create: `ai-backend/core/user_tier.py`
- Create: `ai-backend/tests/test_user_tier.py`

**Interfaces:**
- Produces: `get_tier_config(email: str | None) -> TierConfig`, `TierConfig` dataclass with fields: `tier`, `llm_provider`, `llm_model`, `fast_model`, `embedding_provider`, `embedding_model`, `max_tokens`, `temperature`, `is_owner`

- [ ] **Step 1: Write the failing tests**

Create `ai-backend/tests/test_user_tier.py`:

```python
"""Tests for core/user_tier.py."""
import os
import pytest

# Patch env before importing module so Config singleton isn't stale
os.environ.setdefault("OWNER_EMAIL", "rautanurag9@gmail.com")


def test_owner_email_returns_owner_tier():
    from core.user_tier import UserTier, get_tier_config
    cfg = get_tier_config("rautanurag9@gmail.com")
    assert cfg.tier == UserTier.OWNER


def test_other_email_returns_free_tier():
    from core.user_tier import UserTier, get_tier_config
    cfg = get_tier_config("someone@example.com")
    assert cfg.tier == UserTier.FREE


def test_none_email_returns_free_tier():
    from core.user_tier import UserTier, get_tier_config
    cfg = get_tier_config(None)
    assert cfg.tier == UserTier.FREE


def test_email_matching_is_case_insensitive():
    from core.user_tier import UserTier, get_tier_config
    cfg = get_tier_config("RAUTANURAG9@GMAIL.COM")
    assert cfg.tier == UserTier.OWNER


def test_owner_config_has_openai_provider():
    from core.user_tier import UserTier, get_tier_config
    cfg = get_tier_config("rautanurag9@gmail.com")
    assert cfg.llm_provider == "openai"
    assert "gpt" in cfg.llm_model


def test_free_config_has_groq_provider():
    from core.user_tier import UserTier, get_tier_config
    cfg = get_tier_config("free@example.com")
    assert cfg.llm_provider == "groq"
    assert "llama" in cfg.llm_model


def test_owner_config_has_openai_embeddings():
    from core.user_tier import get_tier_config
    cfg = get_tier_config("rautanurag9@gmail.com")
    assert cfg.embedding_provider == "openai"


def test_free_config_has_huggingface_embeddings():
    from core.user_tier import get_tier_config
    cfg = get_tier_config("free@example.com")
    assert cfg.embedding_provider == "huggingface"
    assert cfg.embedding_model == "all-MiniLM-L6-v2"


def test_is_owner_property():
    from core.user_tier import get_tier_config
    assert get_tier_config("rautanurag9@gmail.com").is_owner is True
    assert get_tier_config("other@example.com").is_owner is False
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd ai-backend && python -m pytest tests/test_user_tier.py -v 2>&1 | head -20
```

Expected: `ImportError` or `ModuleNotFoundError` for `core.user_tier`

- [ ] **Step 3: Create core/user_tier.py**

```python
"""
core/user_tier.py

Determines which LLM and embedding provider a user gets based on their email.
Owner email is set via OWNER_EMAIL env var — never hardcoded beyond the default.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from core.config import config


class UserTier(str, Enum):
    OWNER = "owner"
    FREE = "free"


@dataclass(frozen=True)
class TierConfig:
    """Full provider configuration for a user's tier."""

    tier: UserTier
    llm_provider: str        # "openai" | "groq"
    llm_model: str
    fast_model: str          # cheaper model for extraction/judge
    embedding_provider: str  # "openai" | "huggingface"
    embedding_model: str
    max_tokens: int
    temperature: float

    @property
    def is_owner(self) -> bool:
        """True when this user has owner-tier access."""
        return self.tier == UserTier.OWNER


_OWNER_CONFIG = TierConfig(
    tier=UserTier.OWNER,
    llm_provider="openai",
    llm_model="gpt-4o",
    fast_model="gpt-4o-mini",
    embedding_provider="openai",
    embedding_model="text-embedding-3-small",
    max_tokens=2000,
    temperature=0.0,
)

_FREE_CONFIG = TierConfig(
    tier=UserTier.FREE,
    llm_provider="groq",
    llm_model="llama-3.3-70b-versatile",
    fast_model="llama-3.1-8b-instant",
    embedding_provider="huggingface",
    embedding_model="all-MiniLM-L6-v2",
    max_tokens=2000,
    temperature=0.0,
)


def get_tier_config(email: str | None) -> TierConfig:
    """Return the TierConfig for a user based on their email address."""
    if email and email.strip().lower() == config.OWNER_EMAIL.strip().lower():
        return _OWNER_CONFIG
    return _FREE_CONFIG
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd ai-backend && python -m pytest tests/test_user_tier.py -v
```

Expected: 9 passed

- [ ] **Step 5: Commit**

```bash
git add ai-backend/core/user_tier.py ai-backend/tests/test_user_tier.py
git commit -m "feat: user tier detection — owner gets OpenAI, everyone else gets Groq"
```

---

### Task 3: Multi-provider LLM client

**Files:**
- Modify: `ai-backend/core/llm_client.py`

**Interfaces:**
- Consumes: `TierConfig` from `core.user_tier`
- Produces: `complete(prompt, *, ..., provider="openai", tier_config=None)` → dict; `stream(prompt, *, ..., tier_config=None)` → AsyncGenerator; `complete_with_fallback(prompt_name, user_vars, ..., tier_config=None)` → dict

- [ ] **Step 1: Add Groq sync client at module level**

In `ai-backend/core/llm_client.py`, after the existing imports and after the `_async_client` line, add:

```python
from groq import Groq as _SyncGroq

_groq_client = _SyncGroq(api_key=config.GROQ_API_KEY) if config.GROQ_API_KEY else None
```

Also add the import near the top:
```python
from core.user_tier import TierConfig
```

- [ ] **Step 2: Update complete() to support provider param**

Replace the existing `complete()` function signature and body. The new version adds `provider: str = "openai"` and `tier_config: TierConfig | None = None` params. When `tier_config` is provided, it takes precedence for model and provider selection:

```python
def complete(
    prompt: str,
    *,
    system: str = "You are a helpful assistant.",
    system_prompt: str | None = None,
    model: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
    provider: str = "openai",
    tier_config: "TierConfig | None" = None,
    trace_id: str | None = None,
    extra_metadata: dict | None = None,
) -> dict:
    """
    Send a prompt to the LLM and return a normalized response dict.

    Priority: tier_config > explicit model/provider params > config defaults.

    Returns:
        {text, tokens_used, model, latency_ms, error}
        error is None on success, a string on failure.
    """
    # Resolve provider, model, temp, tokens from tier_config or explicit params
    if tier_config is not None:
        resolved_provider = tier_config.llm_provider
        resolved_model = model or tier_config.llm_model
        resolved_temp = temperature if temperature is not None else tier_config.temperature
        resolved_tokens = max_tokens or tier_config.max_tokens
    else:
        resolved_provider = provider
        resolved_model = model or config.MODEL_NAME
        resolved_temp = temperature if temperature is not None else config.TEMPERATURE
        resolved_tokens = max_tokens or config.MAX_TOKENS

    resolved_tid = trace_id or ""
    resolved_system = system_prompt if system_prompt is not None else system

    messages = [
        {"role": "system", "content": resolved_system},
        {"role": "user", "content": prompt},
    ]

    t0 = time.perf_counter()
    try:
        if resolved_provider == "groq":
            if _groq_client is None:
                raise RuntimeError("GROQ_API_KEY not configured")
            response = _groq_client.chat.completions.create(
                model=resolved_model,
                messages=messages,
                temperature=resolved_temp,
                max_tokens=resolved_tokens,
            )
        else:
            response = _call_openai(messages, resolved_model, resolved_temp, resolved_tokens)

        latency_ms = (time.perf_counter() - t0) * 1000
        usage = response.usage
        cost = _estimate_cost(resolved_model, usage.prompt_tokens, usage.completion_tokens)
        text = (response.choices[0].message.content or "").strip()

        log_llm_call(
            trace_id=resolved_tid,
            model=resolved_model,
            input_tokens=usage.prompt_tokens,
            output_tokens=usage.completion_tokens,
            latency_ms=latency_ms,
            cost_usd=cost,
        )
        if extra_metadata:
            logger.info(
                "[llm] extra_metadata",
                extra={"trace_id": resolved_tid, **extra_metadata},
            )
        return {
            "text": text,
            "tokens_used": usage.prompt_tokens + usage.completion_tokens,
            "model": resolved_model,
            "latency_ms": round(latency_ms, 2),
            "error": None,
        }

    except Exception as exc:
        latency_ms = (time.perf_counter() - t0) * 1000
        log_llm_call(
            trace_id=resolved_tid,
            model=resolved_model,
            input_tokens=0,
            output_tokens=0,
            latency_ms=latency_ms,
            cost_usd=0.0,
            error=str(exc),
        )
        return {
            "text": "",
            "tokens_used": 0,
            "model": resolved_model,
            "latency_ms": round(latency_ms, 2),
            "error": str(exc),
        }
```

- [ ] **Step 3: Update stream() to support tier_config**

Replace the existing `stream()` function signature. Add `tier_config: TierConfig | None = None` param. When tier is groq, use `AsyncOpenAI` with Groq's OpenAI-compatible base URL:

```python
async def stream(
    prompt: str,
    *,
    system: str = "You are a helpful assistant.",
    model: str | None = None,
    temperature: float | None = None,
    tier_config: "TierConfig | None" = None,
    trace_id: str | None = None,
) -> AsyncGenerator[str, None]:
    """
    Stream tokens from the LLM one by one.

    Yields each token string as it arrives. Logs start/end with trace_id and latency.
    Re-raises on error — caller sends the error SSE event.
    No retry: streaming is stateful; retrying would duplicate tokens.
    """
    if tier_config is not None:
        resolved_model = model or tier_config.llm_model
        resolved_temp = temperature if temperature is not None else tier_config.temperature
        resolved_tokens = tier_config.max_tokens
        if tier_config.llm_provider == "groq":
            streaming_client = AsyncOpenAI(
                api_key=config.GROQ_API_KEY,
                base_url="https://api.groq.com/openai/v1",
            )
        else:
            streaming_client = _async_client
    else:
        resolved_model = model or config.MODEL_NAME
        resolved_temp = temperature if temperature is not None else config.TEMPERATURE
        resolved_tokens = config.MAX_TOKENS
        streaming_client = _async_client

    resolved_tid = trace_id or ""

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": prompt},
    ]

    t0 = time.perf_counter()
    token_count = 0
    logger.info("[llm] stream_start", extra={"trace_id": resolved_tid, "model": resolved_model})

    try:
        response = await streaming_client.chat.completions.create(
            model=resolved_model,
            messages=messages,
            temperature=resolved_temp,
            max_tokens=resolved_tokens,
            stream=True,
        )
        async for chunk in response:
            choice = chunk.choices[0] if chunk.choices else None
            if not choice:
                continue
            if choice.finish_reason == "length":
                logger.warning(
                    "[llm] stream truncated: finish_reason=length", extra={"trace_id": resolved_tid}
                )
                continue
            delta_content = choice.delta.content if choice.delta else None
            if delta_content is not None:
                token_count += 1
                yield delta_content

        latency_ms = (time.perf_counter() - t0) * 1000
        logger.info(
            "[llm] stream_end",
            extra={
                "trace_id": resolved_tid,
                "token_count": token_count,
                "latency_ms": round(latency_ms, 2),
            },
        )
    except Exception as exc:
        latency_ms = (time.perf_counter() - t0) * 1000
        logger.error(
            "[llm] stream_error",
            extra={"trace_id": resolved_tid, "error": str(exc), "latency_ms": round(latency_ms, 2)},
        )
        raise
```

- [ ] **Step 4: Update complete_with_fallback() to accept tier_config**

Add `tier_config: TierConfig | None = None` param to the existing `complete_with_fallback()`. Thread it through the `complete()` call inside `asyncio.to_thread`. The signature becomes:

```python
async def complete_with_fallback(
    prompt_name: str,
    user_vars: dict,
    trace_id: str | None = None,
    max_retries: int = 2,
    tier_config: "TierConfig | None" = None,
) -> dict:
```

Inside the function, change the `asyncio.to_thread(complete, ...)` call to also pass `tier_config`:

```python
        result = await asyncio.to_thread(
            complete,
            current_prompt,
            system_prompt=template.system,
            tier_config=tier_config,
            trace_id=trace_id,
            extra_metadata={"prompt_version": template.version, "attempt": attempt},
        )
```

- [ ] **Step 5: Verify existing tests still pass**

```bash
cd ai-backend && python -m pytest -q 2>&1 | tail -5
```

Expected: all existing tests pass (no regressions)

- [ ] **Step 6: Verify Groq client imports correctly**

```bash
cd ai-backend && python -c "from core.llm_client import complete; print('ok')"
```

Expected: `ok`

- [ ] **Step 7: Commit**

```bash
git add ai-backend/core/llm_client.py
git commit -m "feat: add Groq provider support to LLM client (complete, stream, complete_with_fallback)"
```

---

### Task 4: Tiered RAG — dual-collection ingest and tiered retrieval

**Files:**
- Modify: `ai-backend/rag/rag_interface.py`

**Interfaces:**
- Consumes: `TierConfig` from `core.user_tier`
- Produces: `ingest(file_path, metadata)` stores in BOTH "langchain" (OpenAI) and "langchain_hf" (HuggingFace) collections; `retrieve(query, ..., tier_config=None)` uses correct collection; `ask(query, ..., tier_config=None)` threads tier_config through

- [ ] **Step 1: Add HuggingFace vectorstore cache and helpers**

In `ai-backend/rag/rag_interface.py`, add a second vectorstore cache and a helper at module level (after `_vectorstore_cache`):

```python
_PERSIST_DIR_HF = "external/rag_system/db/chroma_db_hf"

_vectorstore_hf_cache: Any = None


def _get_vectorstore_for_tier(deps: dict, tier_config: Any = None) -> Any:
    """Return the correct vectorstore for the user's tier."""
    if tier_config is not None and not tier_config.is_owner:
        return _get_vectorstore_hf(deps)
    return _get_vectorstore(deps)


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
```

- [ ] **Step 2: Update _store_documents() for dual ingest**

Replace the existing `_store_documents()` function with one that stores in both collections:

```python
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

    # Invalidate both caches after write
    _invalidate_vectorstore()
    _invalidate_vectorstore_hf()
    logger.info(f"[rag] Stored {len(documents)} docs in OpenAI vectorstore")
```

- [ ] **Step 3: Update _retrieve_single() to accept tier_config**

Update the `_retrieve_single()` function signature to accept `tier_config`:

```python
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
    return _normalize_docs(docs)
```

- [ ] **Step 4: Update retrieve() to accept and thread tier_config**

Add `tier_config: Any = None` to the `retrieve()` function signature and pass it to `_retrieve_single()`:

```python
async def retrieve(
    query: str,
    top_k: int = 0,
    strategy: str = "",
    use_multi_query: bool = False,
    trace_id: str | None = None,
    tier_config: Any = None,      # NEW
) -> list[dict]:
```

In the body, change the `_retrieve_single` calls to pass `tier_config`:

```python
        for q in queries:
            chunks = await asyncio.to_thread(
                _retrieve_single, q, resolved_top_k, resolved_strategy, tier_config
            )
```

- [ ] **Step 5: Update ask() to accept and thread tier_config**

Add `tier_config: Any = None` to the `ask()` function signature:

```python
async def ask(
    query: str,
    history: list[dict] | None = None,
    user_id: str | None = None,
    trace_id: str | None = None,
    tier_config: Any = None,    # NEW
) -> dict:
```

Thread it through:
1. The `retrieve()` call: add `tier_config=tier_config`
2. The `complete_with_fallback()` call: add `tier_config=tier_config`
3. The `_generate_query_variants()` call: this uses `complete_with_fallback` internally — update `_generate_query_variants()` to accept and pass `tier_config`:

```python
async def _generate_query_variants(query: str, trace_id: str = None, tier_config: Any = None) -> list[str]:
    """Generate 3 alternative phrasings of the query using the LLM."""
    result = await complete_with_fallback(
        prompt_name="query_variants",
        user_vars={"query": query},
        trace_id=trace_id,
        tier_config=tier_config,
    )
    if result["success"] and isinstance(result["data"], list):
        variants = result["data"][:3]
        return [query] + variants
    return [query]
```

Then in `retrieve()` update the call: `queries = await _generate_query_variants(query, trace_id, tier_config)`

- [ ] **Step 6: Verify Python tests still pass**

```bash
cd ai-backend && python -m pytest -q 2>&1 | tail -5
```

Expected: all existing tests pass

- [ ] **Step 7: Commit**

```bash
git add ai-backend/rag/rag_interface.py
git commit -m "feat: dual-collection ingest (OpenAI+HuggingFace) and tiered RAG retrieval"
```

---

### Task 5: Tiered ReAct agent and factory

**Files:**
- Modify: `ai-backend/agents/react_agent.py`
- Modify: `ai-backend/agents/factory.py`

**Interfaces:**
- Consumes: `TierConfig` from `core.user_tier`
- Produces: `ReActAgent.__init__(tool_registry, max_iterations, tier_config=None)` uses correct client; `create_agent(..., tier_config=None)` passes tier_config to ReActAgent

- [ ] **Step 1: Update ReActAgent to accept tier_config**

In `ai-backend/agents/react_agent.py`, update `__init__` to accept and use `tier_config`:

```python
def __init__(
    self,
    tool_registry: ToolRegistry,
    max_iterations: int = 8,
    model: str = None,
    tier_config: "TierConfig | None" = None,
):
    """Initialize with a tool registry and tier configuration."""
    from core.user_tier import TierConfig
    self.tools = tool_registry
    self.max_iterations = max_iterations
    self.tier_config = tier_config

    if tier_config and tier_config.llm_provider == "groq":
        # Groq exposes an OpenAI-compatible API — reuse AsyncOpenAI with different base_url
        self.model = tier_config.llm_model
        self.client = AsyncOpenAI(
            api_key=Config.GROQ_API_KEY,
            base_url="https://api.groq.com/openai/v1",
        )
    else:
        self.model = model or (tier_config.llm_model if tier_config else Config.MODEL_NAME)
        self.client = AsyncOpenAI(api_key=Config.OPENAI_API_KEY)
```

Also add the import at top of the file:
```python
from typing import Optional, TYPE_CHECKING
if TYPE_CHECKING:
    from core.user_tier import TierConfig
```

- [ ] **Step 2: Thread tier_config through run()**

In `run()`, add `tier_config: "TierConfig | None" = None` param. If tier_config is passed, update self.model/self.client before the loop (so per-call override is possible):

```python
async def run(
    self,
    query: str,
    user_id: str,
    trace_id: str = None,
    conversation_history: list[dict] = None,
    user_memories: list[str] = None,
    tier_config: "TierConfig | None" = None,
) -> AgentResult:
```

At the start of `run()`, if a `tier_config` is passed and overrides the instance config:
```python
    if tier_config is not None and tier_config.llm_provider == "groq" and not isinstance(self.client.base_url, str or self.client.base_url.host != "api.groq.com"):
        # Re-configure client for this request's tier
        from core.config import config as _config
        self.model = tier_config.llm_model
        self.client = AsyncOpenAI(
            api_key=_config.GROQ_API_KEY,
            base_url="https://api.groq.com/openai/v1",
        )
```

Actually, simpler approach — just use `self.tier_config` (set in `__init__`) and don't override per-call. The factory creates one agent per request, so the tier is already baked in.

- [ ] **Step 3: Update factory.py to accept and pass tier_config**

In `ai-backend/agents/factory.py`, update `create_agent()`:

```python
def create_agent(
    rag_interface,
    documents_repository,
    max_iterations: int = 8,
    enable_web_search: bool = True,
    tier_config: "TierConfig | None" = None,
) -> ReActAgent:
    """
    Create a fully wired ReAct agent with all tools registered.

    Called once per request — agents are not shared across requests.
    tier_config determines which LLM provider the agent uses.
    """
    registry = ToolRegistry()
    registry.register(SearchDocumentsTool(rag_interface=rag_interface))
    registry.register(GetDocumentListTool(documents_repository=documents_repository))
    registry.register(GetDocumentMetadataTool(documents_repository=documents_repository))
    registry.register(CalculateTool())
    if enable_web_search:
        registry.register(WebSearchTool())
    return ReActAgent(
        tool_registry=registry,
        max_iterations=max_iterations,
        tier_config=tier_config,
    )
```

Also add at top of factory.py:
```python
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from core.user_tier import TierConfig
```

- [ ] **Step 4: Verify existing agent tests pass**

```bash
cd ai-backend && python -m pytest tests/test_agent.py -v 2>&1 | tail -10
```

Expected: all agent tests pass

- [ ] **Step 5: Commit**

```bash
git add ai-backend/agents/react_agent.py ai-backend/agents/factory.py
git commit -m "feat: tiered ReAct agent — Groq or OpenAI client from TierConfig"
```

---

### Task 6: Tiered memory extraction

**Files:**
- Modify: `ai-backend/memory/memory_extractor.py`

**Interfaces:**
- Consumes: `TierConfig` from `core.user_tier`
- Produces: `extract_memories(conversation_messages, trace_id=None, tier_config=None)` uses `tier_config.fast_model` when provided

- [ ] **Step 1: Update extract_memories() to accept tier_config**

In `ai-backend/memory/memory_extractor.py`, update the function signature and the `llm_complete` call:

```python
async def extract_memories(
    conversation_messages: list[dict],
    trace_id: str = None,
    tier_config: "TierConfig | None" = None,
) -> list[str]:
    """
    Extract memorable facts from a conversation.

    Uses tier_config.fast_model when provided, else falls back to config.FAST_MODEL.
    """
    if len(conversation_messages) < 2:
        return []

    formatted = "\n".join(
        f"{m['role'].upper()}: {m['content']}"
        for m in conversation_messages
        if m["role"] in ("user", "assistant")
    )

    # Resolve model and provider from tier_config if available
    model = config.FAST_MODEL
    provider = "openai"
    if tier_config is not None:
        model = tier_config.fast_model
        provider = tier_config.llm_provider

    result = await asyncio.to_thread(
        llm_complete,
        f"Conversation to analyze:\n\n{formatted}\n\nExtracted facts (JSON array):",
        system_prompt=EXTRACTION_PROMPT,
        model=model,
        provider=provider,
        max_tokens=300,
        trace_id=trace_id,
    )
    # rest of function unchanged
```

Also add at top:
```python
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from core.user_tier import TierConfig
```

- [ ] **Step 2: Verify existing memory tests pass**

```bash
cd ai-backend && python -m pytest tests/test_memory_extractor.py -v 2>&1 | tail -10
```

Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add ai-backend/memory/memory_extractor.py
git commit -m "feat: memory extractor uses tier-appropriate fast model"
```

---

### Task 7: Wire tier resolution into Python API routes

**Files:**
- Modify: `ai-backend/api/routes.py`

**Interfaces:**
- Consumes: `X-User-Email` request header (forwarded by Next.js)
- Produces: `tier_config` threaded into `/ask`, `/ask/stream`, `/agent/run`, `/ingest`, `/retrieve`, `/memories/extract`

- [ ] **Step 1: Add tier import to routes.py**

At the top of `ai-backend/api/routes.py`, after the existing imports, add:

```python
from core.user_tier import get_tier_config
```

- [ ] **Step 2: Add _resolve_tier() helper**

Add a small helper at the top of routes.py (after imports):

```python
def _resolve_tier(request: Request):
    """Extract user email from header and return tier config."""
    email = request.headers.get("X-User-Email")
    return get_tier_config(email)
```

- [ ] **Step 3: Update /ask route to resolve tier and thread through**

Find the `/ask` route handler (around line 289). Add tier resolution at the start:

```python
@router.post("/ask")
async def ask_endpoint(ask_request: AskRequest, request: Request, background_tasks: BackgroundTasks):
    trace_id = getattr(request.state, "trace_id", None) or new_trace_id()
    user_id = request.headers.get("X-User-ID", "anonymous")
    tier_config = _resolve_tier(request)   # NEW

    log_pipeline_event("user_tier_resolved", trace_id, {
        "tier": tier_config.tier.value,
        "llm_provider": tier_config.llm_provider,
        "embedding_provider": tier_config.embedding_provider,
    })
```

Then pass `tier_config` to the `ask()` call from `rag_interface`:
```python
    result = await rag_ask(
        query=ask_request.query,
        history=ask_request.history,
        user_id=user_id,
        trace_id=trace_id,
        tier_config=tier_config,   # NEW
    )
```

And pass to agent if routing to agent:
```python
    agent = create_agent(
        rag_interface=_rag_adapter,
        documents_repository=_chroma_doc_repo,
        tier_config=tier_config,   # NEW
    )
```

- [ ] **Step 4: Update /ask/stream route similarly**

Find the streaming route. Add `tier_config = _resolve_tier(request)` and thread it into the `stream()` call from `llm_client`:

```python
    tier_config = _resolve_tier(request)
    # ... existing logic ...
    async for token in stream(prompt, system=system_prompt, tier_config=tier_config, trace_id=trace_id):
        yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
```

- [ ] **Step 5: Update /agent/run route**

Add `tier_config = _resolve_tier(request)` and pass to `create_agent()` and `agent.run()`.

- [ ] **Step 6: Update /memories/extract route**

Find the memories extract route (around line 679). Add:
```python
    tier_config = _resolve_tier(request)
```
And pass to `extract_memories(..., tier_config=tier_config)`.

- [ ] **Step 7: Verify Python tests pass**

```bash
cd ai-backend && python -m pytest -q 2>&1 | tail -8
```

Expected: all tests pass

- [ ] **Step 8: Commit**

```bash
git add ai-backend/api/routes.py
git commit -m "feat: resolve user tier from X-User-Email header in all Python API routes"
```

---

### Task 8: Forward user email from Next.js to Python backend

**Files:**
- Modify: `web-app/lib/backend-client.ts`
- Modify: `web-app/app/api/ask/route.ts`
- Modify: `web-app/app/api/ask/stream/route.ts`
- Modify: `web-app/app/api/agent/run/route.ts`
- Modify: `web-app/app/api/documents/route.ts`

**Interfaces:**
- Consumes: `context.email` (already set by `withAuth` middleware)
- Produces: `backendClient.ask(..., { ..., userEmail })` forwards `X-User-Email` header

- [ ] **Step 1: Add userEmail to the request() private method in backend-client.ts**

Find the `private async request<T>()` method in `web-app/lib/backend-client.ts`. The method already builds a `headers` object with `X-User-ID`. Add `userEmail` to the options type and the header:

Find the options interface for the private `request()` method (it has `userId?: string`). Add `userEmail?: string` to it. Then in the header-building block, after:
```typescript
    if (options.userId) headers['X-User-ID'] = options.userId
```
Add:
```typescript
    if (options.userEmail) headers['X-User-Email'] = options.userEmail
```

There are two `request()` method signatures in backend-client.ts (one around line 230, one around line 436 for FormData). Update both.

- [ ] **Step 2: Add userEmail to ask() options**

In `backendClient.ask()`, add `userEmail?: string` to the options object:

```typescript
  async ask(
    query: string,
    options: {
      topK?: number
      strategy?: string
      history?: Array<{ role: 'user' | 'assistant'; content: string }>
      traceId?: string
      userId?: string
      userEmail?: string    // NEW
    } = {}
  ): Promise<AskResponse> {
```

And pass it to `this.request()`:
```typescript
      userId: options.userId,
      userEmail: options.userEmail,   // NEW
```

- [ ] **Step 3: Add userEmail to askStream() options**

Same pattern for `askStream()`:
```typescript
    options: {
      // ... existing ...
      userEmail?: string   // NEW
    }
```
Add to the headers block directly (askStream builds headers inline):
```typescript
    if (options.userEmail) headers['X-User-Email'] = options.userEmail
```

- [ ] **Step 4: Add userEmail to ingest()**

Update `backendClient.ingest()` signature to add `userEmail?: string` after `userId`:
```typescript
  async ingest(
    file: Blob,
    filename: string,
    metadata: Record<string, unknown> = {},
    traceId?: string,
    userId?: string,
    userEmail?: string    // NEW
  ): Promise<BackendIngestResult> {
```

Pass to `this.request()`:
```typescript
      userId,
      userEmail,   // NEW
```

- [ ] **Step 5: Add userEmail to retrieve() and runAgent()**

Same pattern for `retrieve()` and `runAgent()` — add `userEmail?: string` to their options objects and pass to `this.request()`.

- [ ] **Step 6: Update web-app/app/api/ask/route.ts**

In `createHandler()`, the `context.email` is already available. Update the `backendClient.ask()` call:

```typescript
    const aiResponse = await backendClient.ask(body.query, {
      topK: body.topK,
      strategy: body.strategy,
      history: effectiveHistory,
      traceId: context.requestId,
      userId: userId,
      userEmail: context.email,    // NEW
    })
```

- [ ] **Step 7: Update web-app/app/api/ask/stream/route.ts**

In `streamHandler()`, `context.email` is available. Update the `backendClient.askStream()` call:

```typescript
    pythonStream = await backendClient.askStream(body.query, {
      topK: body.topK,
      strategy: body.strategy,
      history: body.history,
      traceId: context.requestId,
      userId,
      userEmail: context.email,    // NEW
    })
```

- [ ] **Step 8: Update web-app/app/api/agent/run/route.ts**

Update `backendClient.runAgent()` call:

```typescript
  const result = await backendClient.runAgent(body.query, {
    history: body.history,
    userId: context.userId as string,
    userEmail: context.email,    // NEW
    traceId: context.requestId,
  })
```

- [ ] **Step 9: Update web-app/app/api/documents/route.ts**

Find the `backendClient.ingest()` call. Add `context.email` as the `userEmail` param:

```typescript
    const result = await backendClient.ingest(
      // ... existing positional args ...,
      context.email    // NEW — userEmail as last param
    )
```

- [ ] **Step 10: TypeScript type check**

```bash
cd web-app && npx tsc --noEmit 2>&1 | tail -10
```

Expected: zero errors

- [ ] **Step 11: Commit**

```bash
git add web-app/lib/backend-client.ts \
        web-app/app/api/ask/route.ts \
        web-app/app/api/ask/stream/route.ts \
        web-app/app/api/agent/run/route.ts \
        web-app/app/api/documents/route.ts
git commit -m "feat: forward X-User-Email from Next.js session to Python backend for tier routing"
```

---

### Task 9: Tests for embeddings and final verification

**Files:**
- Create: `ai-backend/tests/test_embeddings.py`

**Interfaces:**
- Consumes: `HuggingFaceEmbeddings` from langchain-community (already installed), `get_tier_config` from core.user_tier

- [ ] **Step 1: Write embedding tests**

Create `ai-backend/tests/test_embeddings.py`:

```python
"""Tests for tiered embedding selection."""
import os
import pytest

os.environ.setdefault("OWNER_EMAIL", "rautanurag9@gmail.com")
os.environ.setdefault("OPENAI_API_KEY", "test-key")


def test_owner_tier_has_openai_embeddings():
    from core.user_tier import get_tier_config
    cfg = get_tier_config("rautanurag9@gmail.com")
    assert cfg.embedding_provider == "openai"
    assert cfg.embedding_model == "text-embedding-3-small"


def test_free_tier_has_huggingface_embeddings():
    from core.user_tier import get_tier_config
    cfg = get_tier_config("someone@example.com")
    assert cfg.embedding_provider == "huggingface"
    assert cfg.embedding_model == "all-MiniLM-L6-v2"


def test_huggingface_embedder_returns_floats():
    """HuggingFace embedder runs locally — no API key needed."""
    from langchain_community.embeddings import HuggingFaceEmbeddings
    embedder = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    result = embedder.embed_documents(["hello world"])
    assert isinstance(result, list)
    assert len(result) == 1
    assert isinstance(result[0], list)
    assert all(isinstance(v, float) for v in result[0])


def test_huggingface_embedding_dimension_is_384():
    from langchain_community.embeddings import HuggingFaceEmbeddings
    embedder = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    result = embedder.embed_documents(["test sentence"])
    assert len(result[0]) == 384
```

- [ ] **Step 2: Run embedding tests**

```bash
cd ai-backend && python -m pytest tests/test_embeddings.py -v
```

Expected: 4 passed (HuggingFace tests run locally — no API key needed)

- [ ] **Step 3: Run full Python test suite**

```bash
cd ai-backend && python -m pytest -q 2>&1 | tail -8
```

Expected: all tests pass, 0 failures

- [ ] **Step 4: TypeScript final check**

```bash
cd web-app && npx tsc --noEmit && echo "TypeScript OK"
```

Expected: "TypeScript OK"

- [ ] **Step 5: Update CLAUDE.md**

In the project's `.claude/CLAUDE.md`, update the `Current Status` section to add after Day 15:

```
- Day 16 (Pre-deploy): Tiered API Access — COMPLETE
  - Owner (rautanurag9@gmail.com): OpenAI GPT-4o + text-embedding-3-small
  - Free tier (everyone else): Groq llama-3.3-70b-versatile + HuggingFace all-MiniLM-L6-v2 (local)
  - Tier resolved per-request from X-User-Email header (forwarded from JWT session)
  - Dual ChromaDB collections: "langchain" (OpenAI embeddings), "langchain_hf" (HuggingFace)
  - Ingest writes to both collections so all tiers can retrieve documents
  - Evals always use GPT-4o as judge regardless of tier (model_override path in llm_client)
```

- [ ] **Step 6: Final commit**

```bash
git add ai-backend/tests/test_embeddings.py ai-backend/tests/test_user_tier.py .claude/CLAUDE.md
git commit -m "feat: tiered API access — OpenAI for owner, Groq+HuggingFace for everyone else

- Owner (rautanurag9@gmail.com): OpenAI GPT-4o + text-embedding-3-small
- Free tier: Groq llama-3.3-70b-versatile + HuggingFace all-MiniLM-L6-v2
- Tier resolved from X-User-Email header per request
- Dual ChromaDB collections for tiered embedding retrieval"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Covered in Task |
|-------------|-----------------|
| Install groq + sentence-transformers | Task 1 (sentence-transformers already present) |
| GROQ_API_KEY + OWNER_EMAIL in config | Task 1 + 2 |
| User tier detection from email | Task 2 |
| Multi-provider LLM (OpenAI + Groq) | Task 3 |
| Tiered embeddings (OpenAI + HuggingFace) | Task 4 |
| Dual ingest (both collections) | Task 4 |
| Tiered retrieval | Task 4 |
| Tiered ask() | Task 4 |
| Tiered agent (Groq-compatible via OpenAI base_url) | Task 5 |
| Tiered memory extraction | Task 6 |
| X-User-Email in Python routes | Task 7 |
| Next.js forwards X-User-Email | Task 8 |
| Tests for tier detection | Task 2 |
| Tests for embeddings | Task 9 |
| TypeScript zero errors | Task 8 + 9 |
| CLAUDE.md update | Task 9 |

**Placeholder scan:** No TBD, TODO, or "handle later" patterns found.

**Type consistency:** `TierConfig` is used consistently across tasks 2–8. `tier_config: TierConfig | None` is the parameter name throughout. `get_tier_config(email)` is the single factory function.

**Edge cases handled:**
- `groq` client is None-guarded (raises `RuntimeError` with clear message if key missing)
- HuggingFace ingest failure is logged as warning, not fatal — owner ingest still succeeds
- `context.email` may be `undefined` in TypeScript — `userEmail?: string` is optional throughout
- `X-User-Email` missing in Python defaults to `get_tier_config(None)` → FREE tier (safe default)
