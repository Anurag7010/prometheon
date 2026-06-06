# Architecture Decision Records

## ADR-001: LangChain vs Manual Implementation

**Date:** 2026-06-05
**Status:** Decided

### Context

The AI backend was built in two phases:
1. Manual implementation (Phase 1-3): LLM client, RAG interface, guardrails, agent loop
2. LangChain evaluation (Phase 4, Day 13): LCEL pipeline, callbacks

### Decision

**Use LangChain for:**
- Standard RAG chains via LCEL (`pipelines/lcel_qa_pipeline.py`)
- Observability callbacks (`ObservabilityCallback`)
- Rapid prototyping of new chain patterns

**Use manual code for:**
- Agent reasoning loop (`agents/react_agent.py`) — chains cannot express conditional branching cleanly
- Memory management (`memory/`) — requires custom database integration
- Guardrails (`core/guardrails.py`) — needs precise control over execution flow
- Output validation with fallback (`core/output_validator.py`) — retry logic does not fit chain model

### Rationale

LCEL produces cleaner code for standard patterns (`retriever | prompt | llm | parser`).
Manual code is clearer for complex custom logic with conditional paths.
The key test: can you debug it when it fails? Manual code wins for complex flows.

### Consequences

- Two QA pipeline implementations exist — LCEL (`pipelines/lcel_qa_pipeline.py`) and manual (`rag/rag_interface.py`)
- Manual pipeline is the production path (more observable, more debuggable)
- LCEL pipeline is the learning artifact demonstrating LangChain knowledge
- `ObservabilityCallback` is used in both pipelines

---

## ADR-002: MCP Server Scope

**Date:** 2026-06-05
**Status:** Decided

### Context

MCP (Model Context Protocol) standardizes tool interfaces for LLMs.
Our tools (`search_documents`, `calculate`, `get_document_list`) can be exposed as an MCP server.

### Decision

Build a minimal MCP server (`mcp_server/server.py`) that:
- Exposes three stateless tools
- Uses stdio transport for local Claude Desktop integration
- Does NOT expose `get_document_list` with real user data (requires auth integration not yet done)

### What We Do NOT Build

- HTTP/SSE MCP transport (needed for cloud deployment — future work)
- Per-user auth in MCP (requires MCP auth spec — future work)
- Full document CRUD via MCP (scope creep)

### Rationale

The MCP server demonstrates the concept and enables Claude Desktop integration.
Full production MCP deployment requires auth integration beyond this project's current scope.

---

## ADR-003: Web Search Integration

**Date:** 2026-06-05
**Status:** Decided

### Decision

Use Tavily for web search:
- Designed for LLM use: structured output, no HTML noise
- Free tier sufficient for development
- Graceful fallback when API key not configured (returns instructive message, no crash)

### Routing

- Queries about current events, recent news, specific people/companies → Agent with `WebSearchTool`
- Queries about document content → RAG pipeline
- All other multi-step queries → Agent with document tools only

---

## System Architecture (End of Phase 4, Day 13)

    Browser
      ↓ HTTPS
    Next.js (port 3000)
      ├── App Router pages: /, /login, /register, /dashboard, /documents, /chat, /agent, /settings
      ├── API Routes: /api/ask, /api/ask/stream, /api/agent/run, /api/documents, /api/conversations, /api/memories
      ├── Auth: JWT (access 15min + refresh 7d HttpOnly cookie)
      └── DB: PostgreSQL via Drizzle (users, documents, queries, conversations, messages)
      ↓ HTTP + X-API-Key
    Python FastAPI (port 8000)
      ├── /ask → QueryRouter → RAG or Agent
      ├── /ask/stream → StreamingResponse SSE
      ├── /agent/run → ReActAgent
      ├── /ingest → RAGInterface.ingest()
      ├── /retrieve → RAGInterface.retrieve()
      ├── /memories → LongTermMemoryStore
      └── /metrics → log aggregation
      ↓
    Core Systems:
      ├── RAGInterface (guardrails + caching + memory)
      ├── ReActAgent (search_documents, get_document_list, get_document_metadata, calculate, web_search)
      ├── ConversationBuffer (short-term memory, token windowing)
      ├── LongTermMemoryStore (ChromaDB)
      ├── PromptRegistry (versioned prompts)
      ├── ObservabilityCallback (LangChain callbacks → structured logger)
      └── LCEL QA Pipeline (parallel implementation — learning artifact)
      ↓
    External:
      ├── OpenAI API (GPT-4o + GPT-4o-mini)
      ├── ChromaDB (document vectors + memory vectors)
      └── Tavily API (web search, optional)

    MCP Server (stdio, separate process):
      └── Exposes: search_documents, calculate, get_document_list
      └── Connects to: Claude Desktop, Cursor, any MCP client

## ADR-004: Production Hardening Decisions

**Date:** 2026-06-06
**Status:** Decided

### Rate Limiting
**Decision:** In-memory sliding window per user (20 req/min for ask, 5 req/min for ingest)
**Limitation:** In-memory only — does not work across multiple instances
**Migration path:** Replace with Redis-backed rate limiter when scaling horizontally

### Cost Controls
**Decision:** In-memory daily token budget (100K tokens/user/day)
**Limitation:** Resets on server restart; per-instance not per-cluster
**Migration path:** Persist to PostgreSQL or Redis

### Concurrency
**Decision:** asyncio.Semaphore (10 concurrent LLM calls)
**Rationale:** Prevents OpenAI rate limit errors under concurrent load
**Migration path:** Adjust MAX_CONCURRENT based on OpenAI tier limits

### Evaluation
**Decision:** LLM-as-judge pipeline using GPT-4o scoring faithfulness, relevance, completeness
**Rationale:** More reliable than keyword matching for complex answers; CI-ready via exit code
**Dataset:** 20 questions (5 factual, 5 inferential, 5 edge case, 5 adversarial)
**Passing threshold:** 0.7 composite score

## Scaling to 1000 Users — What Changes

1. Rate limiter → Redis (shared across instances)
2. Cost controller → PostgreSQL table (persisted, shared)
3. In-memory cache → Redis (shared, not per-instance)
4. ChromaDB local → Pinecone or Weaviate (hosted, scalable)
5. Single uvicorn → Multiple workers behind nginx or load balancer
6. Single PostgreSQL → Connection pooling (PgBouncer) + read replicas
7. Estimated cost at 1000 users × 10 queries/day: $100-500/day on GPT-4o
