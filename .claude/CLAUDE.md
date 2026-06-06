# AI Product — Project Instructions for Claude Code

## What This Project Is

A production-level AI-powered full-stack product being built over a 40-day structured plan.
Three interconnected systems:

1. AI backend (Python) — LLM wrapper, RAG pipeline, observability, evals, agents
2. Web app (Next.js + TypeScript) — full-stack frontend with API routes
3. Integration layer — connects AI backend to web app

## Current Status

- Days 1-2: AI backend foundation — COMPLETE (llm_client, prompt_engine, rag_interface, logger, tracer, eval_runner)
- Days 3-8: AI backend hardened — COMPLETE (observability, evals, refactor)
- Days 9-10: Async utilities — COMPLETE (lib/async.ts, services/base-service.ts, services/ai-service.ts)
- Days 11-12: HTTP middleware + database layer — COMPLETE
- Days 13-14: TypeScript type system + React hooks + UI components — COMPLETE
- Days 15-16: Next.js app structure + UI component library — COMPLETE
- Days 17-18 (Day 7): Integration architecture + SSE streaming — COMPLETE
  - FastAPI server: /ask, /ingest, /retrieve, /health, /ask/stream
  - Next.js proxy routes wired to Python backend via backendClient
  - SSE streaming: tokens stream token-by-token from Python → Next.js → browser
  - SSE parser (lib/sse-parser.ts), useAsk streaming with token batching
  - 34 Python API tests, 22 SSE parser tests, 10 stream route tests — all passing
  - 2 bugs found and fixed: AskRequest min_length=1, logging.LogRecord filename conflict
  - Smoke test (test_smoke.py) skips automatically when server not running
- Day 19 (Day 8): Authentication — COMPLETE
  - bcrypt password hashing (lib/password.ts, cost factor 12)
  - JWT sign/verify with jose, separate access/refresh secrets (lib/jwt.ts)
  - Real getSession(), createSessionCookies(), clearSessionCookies() (lib/auth.ts)
  - Access token: 15min, stored in memory + cookie for Server Components
  - Refresh token: 7d, HttpOnly cookie restricted to /api/auth/refresh
  - Auth routes: POST /api/auth/register, login, logout, refresh
  - withAuth middleware updated to use jose verifyAccessToken
  - useAuth hook with auto-refresh every 14min (hooks/useAuth.ts)
  - Login and register pages call real endpoints
  - backend-client.ts forwards X-User-ID header to Python backend
  - 17 JWT tests, 10 password tests, 13 auth route tests — all passing
  - Timing attack prevention in login (always calls verifyPassword)
- Days 20-21 (Day 9): Caching + Performance + AI Observability — COMPLETE
  - LRUCache with TTL + LRU eviction (core/cache.py); retrieval_cache (5min) + llm_cache (1hr)
  - Caching added to retrieve() and ask() in rag_interface.py — cache_hit/cache_miss log events
  - Python logger now writes to file + stdout (observability/logger.py); LOG_FILE in config
  - Log aggregation: compute_metrics() reads structured logs → dashboard metrics (observability/metrics.py)
  - New Python endpoints: GET /cache/stats, POST /cache/clear, GET /metrics
  - GET /health updated to include cache stats
  - backendClient.getMetrics() added; AIMetrics type in types/api.ts
  - GET /api/dashboard/stats — aggregates DB + AI metrics in parallel (app/api/dashboard/stats/)
  - revalidateTag('documents') on document POST/DELETE mutations
  - Dashboard page: real AI Observability section (latency, cache hit rate, cost, error rate)
  - Dynamic imports: DocumentUploadModal and ChatInterface (ssr: false)
  - All required DB indexes confirmed present in schema.ts
  - 19 Python tests, 6 TypeScript dashboard tests — all passing
- Days 22-24 (Day 10): Prompt Reliability + Guardrails + RAG Quality — COMPLETE
  - Prompt registry (core/prompt_registry.py): 5 versioned prompts, single source of truth
  - Output validator (core/output_validator.py): JSON + prose validation, schema enforcement
  - LLM client: complete_with_fallback() with validation retry chain (max 2 attempts)
  - Guardrails (core/guardrails.py): sanitize_input (10 injection patterns, abbreviation expansion, 2000 char limit), sanitize_output (PII removal, disclaimer stripping), async check_query with optional off-topic LLM check
  - Config: MAX_QUERY_CHARS=2000, FAST_MODEL=gpt-4o-mini, RELEVANCE_THRESHOLD=0.65
  - Context manager (rag/context_manager.py): token-aware chunk selection, citation_id assignment
  - RAG interface: guardrails wired into ask()/retrieve(), score threshold filtering, multi-query retrieval, both functions now async
  - API: AskResponse updated (guardrail_rejected, no_results, retrieval_quality), SourceResponse with citation_id
  - Web app: AskResponse type updated, Source.score nullable, Message.role includes 'warning', warning-styled bubbles for guardrail rejections, source citations rendered below answers
  - Eval harness: async evaluate()/run_all(), avg_retrieval_quality/guardrail_rejection_rate/no_result_rate metrics
  - 36 new Python tests (test_guardrails, test_output_validator, test_context_manager) — all passing
  - Phase 3 complete — eval results in docs/eval-results-phase3.md
- Days 25-26 (Day 11): Agents + Tool Use — COMPLETE
  - Tool system: BaseTool ABC, ToolRegistry, ToolResult (agents/tools/base.py)
  - 4 tools: search_documents, get_document_list, get_document_metadata, calculate (agents/tools/implementations.py)
  - CalculateTool uses AST-based safe eval with math module allowlist — no exec()/eval()
  - ReAct agent: OpenAI function calling loop, max_iterations=8, full step logging (agents/react_agent.py)
  - Query router: keyword pattern matching, defaults to RAG, routes complex queries to agent (agents/router.py)
  - Factory: create_agent() wires all 4 tools with RAGAdapter and ChromaDocumentRepository (agents/factory.py)
  - API: POST /agent/run (direct agent), POST /ask updated with auto-routing (routed_to field on AskResponse)
  - Types: AgentStep, AgentRunResponse in types/api.ts; runAgent() on backendClient
  - Next.js: POST /api/agent/run route (auth + DB recording), useAgent hook, AgentInterface component
  - Agent page at /agent with collapsible reasoning trace UI
  - Sidebar updated with Agent nav link
  - 28 Python tests (test_tools.py, test_agent.py) — all passing
  - 7 TypeScript tests (useAgent.test.ts) — all passing
  - 2 bugs found and fixed: Config import singleton pattern, router regex boundary
- Day 12 (Phase 4): Memory Systems — COMPLETE
- Days 27+ (Day 12): Memory Systems — COMPLETE
  - ConversationBuffer: token-aware windowing (max 2000 tokens) with window/summary strategies
  - LongTermMemoryStore: ChromaDB-backed user fact store with dedup (cosine similarity >= 0.95)
  - MemoryExtractor: LLM-based fact extraction using FAST_MODEL (gpt-4o-mini)
  - ask() updated: loads conversation history via ConversationBuffer, injects long-term memories
  - ReActAgent updated: accepts user_memories param, injects into system prompt
  - Python API: GET/DELETE /memories, POST /memories/extract (background tasks)
  - Next.js: /api/conversations (CRUD), /api/conversations/[id]/messages, /api/memories (all three)
  - ask route: conversationId param, auto-save messages, auto-title, fire-and-forget extraction
  - MemoryPanel component: view and delete memories in /settings page
  - 38 Python tests passing (test_conversation_buffer, test_long_term_memory, test_memory_extractor)
- Day 13 (Phase 4): Framework Awareness + MCP Concepts — COMPLETE
  - ObservabilityCallback: bridges LangChain events to structured logger (observability/langchain_callback.py)
  - LCEL QA pipeline: parallel implementation to rag_interface — retriever | prompt | llm | parser (pipelines/lcel_qa_pipeline.py)
  - Pipeline comparison script: proves LCEL and manual pipelines produce equivalent answers (pipelines/pipeline_comparison.py)
  - MCP server: exposes search_documents, calculate, get_document_list via stdio transport (mcp_server/server.py)
  - MCP test client: verifies tool discovery and calculate invocation (mcp_server/test_client.py)
  - WebSearchTool: Tavily-powered web search with graceful fallback (agents/tools/web_search.py)
  - Factory updated: create_agent() now accepts enable_web_search flag (agents/factory.py)
  - Router updated: routes current/latest/recent/news/who-is queries to agent (agents/router.py)
  - Architecture decisions documented: 3 ADRs + full system diagram (docs/architecture.md)
  - 23 new Python tests — all passing (test_lcel_pipeline, test_web_search_tool, test_mcp_server)
- Day 14 (Phase 4): Evals + Production Thinking + Phase 4 Closure — COMPLETE
  - Fine-tuning decision documented (docs/fine_tuning_decision.md): not appropriate at this stage
  - Eval dataset: 20 questions (5 factual, 5 inferential, 5 edge case, 5 adversarial) in evals/eval_dataset.json
  - LLM-as-judge pipeline (evals/llm_judge.py): GPT-4o scores faithfulness, relevance, completeness
  - eval_runner.py extended: run_llm_judge_eval() with regression detection, results saved to evals/results/
  - Rate limiter (core/rate_limiter.py): sliding window per user — 20 req/min ask, 5 req/min ingest
  - Cost controller (core/cost_controller.py): daily token budget 100K tokens/user with usage tracking
  - Request queue (core/request_queue.py): asyncio.Semaphore, 10 concurrent LLM calls, 30s timeout
  - Production config (core/production_config.py): DevelopmentConfig vs ProductionConfig classes
  - api/routes.py: rate limit + budget + queue wired into /ask and /ingest
  - GET /health updated: includes queue stats, rate limiter stats, system memory via psutil
  - server.py: uses production_config for reload and log_level
  - backend-client.ts: isHealthy() method + graceful 503/502 handling in ask()
  - ChatInterface.tsx: distinct UI for backend temporarily unavailable (amber, retry button)
  - docs/architecture.md: ADR-004 (production hardening) + scaling to 1000 users section
  - 26 Python tests passing (test_rate_limiter, test_cost_controller, test_request_queue, test_llm_judge)
  - npx tsc --noEmit — zero errors
  - Phase 4 — COMPLETE
- Next: Phase 5 — Final Product (Days 33-40)

## System Capabilities (End of Phase 4)

- Upload PDFs → ingested into vector store
- Ask questions → auto-routed: simple → RAG pipeline, complex → ReAct agent
- RAG pipeline: guardrail check → multi-query retrieval → score-threshold filtering → context-managed prompt → streamed answer with citations
- Agent pipeline: tool selection → search_documents / get_document_list / get_document_metadata / calculate → reasoning trace → final answer
- Agent reasoning trace visible in /agent page UI (collapsible steps)
- Real JWT auth protecting all routes
- Caching on retrieval and LLM responses (with correct cache_miss event timing)
- Real dashboard metrics from logs and database
- Prompt versioning and output validation with retry chain
- Source citations in answers with citation_id mapping
- Guardrail rejection surfaced as warning-styled messages in UI
- Persistent conversations: history saved to DB, loaded per session
- Short-term memory: ConversationBuffer with token windowing (max 2000 tokens)
- Long-term memory: user facts stored as embeddings in ChromaDB, retrieved per query
- Memory extraction: facts automatically extracted after each conversation (background)
- Memory injection: relevant memories injected into system prompt per query
- Memory settings UI: users can view and delete their memories at /settings
- LCEL QA pipeline (parallel to manual — learning artifact, see pipelines/lcel_qa_pipeline.py)
- LangChain ObservabilityCallback — unified logging across chains (observability/langchain_callback.py)
- MCP server exposing search_documents, calculate, get_document_list (stdio transport, connect with Claude Desktop)
- Web search via Tavily — agent can access real-time information (agents/tools/web_search.py)
- Query router updated: current/latest/recent/news/who-is queries → agent with web search
- Architecture decision records in docs/architecture.md (4 ADRs + scaling to 1000 users)
- LLM-as-judge eval pipeline with 20-question dataset, CI-ready (exit code 1 on failure)
- Rate limiting: 20 req/min per user (ask), 5 req/min (ingest) — sliding window in-memory
- Cost controls: 100K daily token budget per user — in-memory
- Request queuing: max 10 concurrent LLM calls via asyncio.Semaphore, 30s timeout
- Graceful degradation: 503/502 handled cleanly in Next.js with distinct UI + retry button
- Production config: DevelopmentConfig vs ProductionConfig (FRONTEND_URL required in prod)

## Known Limitations (documented for Phase 5)

- Rate limiter and cost controller are in-memory only
- ChromaDB is local file-based — not suitable for multi-instance deployment
- Auth tokens not forwarded to MCP server
- No deployment pipeline yet (Phase 5)

## Framework Decisions (After Day 14)

- LangChain USED for: LCEL standard RAG chains, observability callbacks
- LangChain NOT used for: agent loop, memory, guardrails, output validation (manual code is clearer)
- MCP server: stdio for Claude Desktop (HTTP/SSE deployment is future work)
- WebSearchTool: graceful no-op when TAVILY_API_KEY is unset

## Project Structure

\`\`\`
ai-backend-project/
├── ai-backend/ # Python — DO NOT break existing functionality
│ ├── core/
│ │ ├── llm_client.py
│ │ ├── prompt_engine.py
│ │ └── config.py
│ ├── rag/
│ │ └── rag_interface.py
│ ├── observability/
│ │ ├── logger.py
│ │ └── tracer.py
│ ├── evals/
│ │ ├── eval_runner.py
│ │ └── test_cases.py
│ ├── pipelines/
│ │ └── qa_pipeline.py
│ └── main.py
└── web-app/ # Next.js — active development
├── app/
├── components/
│ ├── ui/
│ ├── nav/
│ ├── features/
│ └── providers/
├── hooks/
├── lib/
│ └── middleware/
├── services/
├── types/
├── db/
│ └── repositories/
└── styles/
\`\`\`

## Absolute Rules — Never Violate These

### Code Quality

- Zero `any` types in TypeScript — use `unknown` and type guards
- No hardcoded colors — use design tokens and CSS variables only
- No `print()` in Python production paths — use structured logger
- No bare `except` in Python — always catch specific exceptions
- No raw `fetch()` calls in components — always go through AIService
- No database queries in route handlers — always go through repositories
- No LangChain objects outside rag_interface.py

### Architecture

- Server Components are the default — add 'use client' only when needed
- Push 'use client' as far down the tree as possible
- State lives as close to where it is used as possible — lift only when needed
- Every public function has type hints and a one-line docstring (Python)
- Every public function has TypeScript types on all parameters and return values

### File Conventions

- Python: snake_case files and functions
- TypeScript: camelCase functions, PascalCase components and types
- All components export from components/ui/index.ts
- All types export from types/index.ts
- All hooks export from hooks/index.ts (create this if missing)

### Testing

- New repositories get repository tests
- New API routes get route tests
- New hooks get hook tests using renderHook
- New utilities get unit tests
- Run tests before marking any block complete

## Environment Variables Required

### web-app/.env.local

\`\`\`
DATABASE_URL=postgresql://localhost:5432/ai_product_dev
DATABASE_URL_TEST=postgresql://localhost:5432/ai_product_test
NEXT_PUBLIC_AI_BACKEND_URL=http://localhost:8000
JWT_SECRET=dev-secret-change-in-production
LOG_LEVEL=debug
\`\`\`

### ai-backend/.env

\`\`\`
OPENAI_API_KEY=your-key-here
MODEL_NAME=gpt-4o
TEMPERATURE=0.0
MAX_TOKENS=2000
LOG_LEVEL=INFO
\`\`\`

## Technology Stack

### AI Backend (Python)

- Python 3.11+
- openai, langchain, langchain-openai
- chromadb for vector storage
- pydantic for data validation
- pytest for testing

### Web App (Next.js)

- Next.js 14+ with App Router
- TypeScript 5+
- Tailwind CSS with custom design tokens
- Drizzle ORM + PostgreSQL
- Zod for validation
- Vitest + Testing Library for tests
- jose for JWT

## How to Run

### AI Backend

\`\`\`bash
cd ai-backend
pip install -r requirements.txt
python main.py
\`\`\`

### Web App

\`\`\`bash
cd web-app
npm install
npm run dev
\`\`\`

### Tests

\`\`\`bash

# Python

cd ai-backend && pytest

# TypeScript

cd web-app && npm test
\`\`\`

## Current Blockers / Known Issues

<!-- Update this section as issues are found and resolved -->

- Smoke test requires manual server startup — not automated yet
- Python backend trusts X-User-ID header from Next.js (no direct JWT verification on Python side yet)
- Jose has cross-realm Uint8Array issues in vitest VM — tests mock lib/jwt using Node.js crypto (tests/setup/jwt-mock.ts)
- Log aggregation is file-based — requires LOG_FILE path configured in Python config (defaults to logs/ai_backend.log)
- Dashboard AI metrics require Python backend running; ai field is null when backend is down (non-fatal)
- db/verify-indexes.ts cannot run standalone (server-only guard in db/connection.ts) — verified indexes statically via schema.ts

## What Claude Code Should Do on Every Session Start

1. Read this file completely
2. Run `npx tsc --noEmit` in web-app/ — note any existing errors
3. Check git status — understand what is in progress
4. Ask what block or task to work on if not specified in the prompt
