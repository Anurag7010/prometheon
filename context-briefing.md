# AI Product — Context Briefing

> Use this document to orient a new Claude session on the full history and current state of the project.

---

## What This Project Is

A production-level AI-powered full-stack application built across a **40-day structured syllabus**.
Three tightly integrated systems:

1. **AI Backend** (`ai-backend/`) — Python FastAPI server: LLM wrapper, RAG pipeline, agents, memory, observability, evals
2. **Web App** (`web-app/`) — Next.js 16 + TypeScript full-stack frontend with its own API routes and PostgreSQL database
3. **Integration Layer** — Next.js API routes proxy to the Python backend; SSE streaming bridged end-to-end

The product lets users upload PDFs, ask questions against them (auto-routed to RAG or an AI agent), view reasoning traces, manage memories, and track usage via a real-time dashboard.

---

## Syllabus Map

```
Phase 1 (Days 1–8)   — AI backend foundation, RAG, observability, evals
Phase 2 (Days 9–16)  — JS/TS, Next.js, auth, caching, UI foundations
Phase 3 (Days 17–24) — Integration, streaming, auth, caching, prompt/guardrail hardening
Phase 4 (Days 25–32) — Agents, memory, MCP, LangChain LCEL, evals, production hardening
Phase 5 (Days 33–40) — Final product: UI polish, onboarding, deployment, packaging
```

---

## Completion Status (as of session start)

### Phase 1 — COMPLETE (Days 1–8)

| Day | Deliverable |
|-----|-------------|
| 1 | LLM wrapper with retries, timeouts, structured output (`core/llm_client.py`) |
| 2 | Prompt engine + versioned templates (`core/prompt_engine.py`, `prompts/templates/`) |
| 3 | ChromaDB vector store, PDF ingestion pipeline |
| 4 | Retrieval quality, RAG prompt wiring |
| 5 | Full RAG pipeline end-to-end (`rag/rag_interface.py`) |
| 6 | Structured JSON logger + tracer (`observability/logger.py`, `tracer.py`) |
| 7 | Eval harness + test cases (`evals/eval_runner.py`, `evals/test_cases.py`) |
| 8 | Hardening + refactor — config singleton, async patterns |

### Phase 2 — COMPLETE (Days 9–16)

| Day | Deliverable |
|-----|-------------|
| 9 | Async utilities (`lib/async.ts`) — debounce, retry, race, abortable |
| 10 | Base service + AI service (`services/base-service.ts`, `services/ai-service.ts`) |
| 11 | HTTP middleware (`withAuth`) + Drizzle ORM + PostgreSQL schema |
| 12 | Database repositories (users, documents, queries, conversations, messages, search history) |
| 13 | TypeScript type system (`types/api.ts`, `types/domain.ts`, `types/state.ts`) |
| 14 | React hooks (useAsk, useDocuments, useUpload, useAsyncState, useAbortController, useToast) |
| 15 | Next.js App Router structure, all page layouts, Server vs Client component split |
| 16 | Design system: Tailwind v3 design tokens, Button, Input, Card, Sidebar, MobileSidebar |

### Phase 3 — COMPLETE (Days 17–24)

| Day | Deliverable |
|-----|-------------|
| 17–18 | FastAPI endpoints (`/ask`, `/ingest`, `/retrieve`, `/health`, `/ask/stream`). Next.js proxy routes. SSE streaming token-by-token end-to-end. SSE parser (`lib/sse-parser.ts`), `useAsk` with token batching. |
| 19 | Full JWT auth: bcrypt passwords, access token (15min) + refresh token (7d, HttpOnly), `lib/auth.ts`, `lib/jwt.ts`, `lib/password.ts`. Auth routes: register/login/logout/refresh. `useAuth` with 14min auto-refresh. |
| 20–21 | LRU+TTL cache in Python (`core/cache.py`) on retrieval + LLM calls. Log aggregation → metrics endpoint. Dashboard AI Observability section (latency, cache hit rate, cost, error rate). `GET /api/dashboard/stats` parallel aggregation. |
| 22–24 | Prompt registry (5 versioned prompts). Output validator with JSON + prose validation and retry chain. Guardrails: input sanitization (10 injection patterns, 2000-char limit), output PII removal, async off-topic check. Context manager: token-aware chunk selection with citation_id. Multi-query retrieval, relevance score threshold (0.65). Warning-bubble UI for guardrail rejections. Source citations rendered below answers. |

### Phase 4 — COMPLETE (Days 25–32 mapped to Days 11–14 in project log)

| Block | Deliverable |
|-------|-------------|
| Agents | Tool system: `BaseTool` ABC + `ToolRegistry`. 4 tools: `search_documents`, `get_document_list`, `get_document_metadata`, `calculate` (AST-based safe eval). ReAct agent with OpenAI function calling loop (max 8 iterations). Query router: keyword patterns → RAG or agent. Factory wires all tools with RAGAdapter. `/agent/run` API + `useAgent` hook + Agent page with collapsible reasoning trace. |
| Memory | `ConversationBuffer`: token-aware windowing (max 2000 tokens). `LongTermMemoryStore`: ChromaDB-backed user fact store with cosine dedup (≥0.95). `MemoryExtractor`: LLM-based fact extraction via gpt-4o-mini. `ask()` injects both conversation history and long-term memories. Python API: GET/DELETE `/memories`, POST `/memories/extract`. MemoryPanel in `/settings`. |
| Frameworks | `ObservabilityCallback` bridges LangChain events to structured logger. LCEL QA pipeline (parallel to manual — learning artifact). MCP server: exposes `search_documents`, `calculate`, `get_document_list` via stdio transport for Claude Desktop. `WebSearchTool`: Tavily-powered with graceful fallback when key absent. Router extended: current/latest/recent/news/who-is queries → agent with web search. |
| Evals + Production | LLM-as-judge pipeline (`evals/llm_judge.py`): GPT-4o scores faithfulness, relevance, completeness on 20-question dataset (5 factual/5 inferential/5 edge/5 adversarial). Rate limiter: sliding window 20 req/min (ask), 5 req/min (ingest). Cost controller: 100K daily token budget per user. Request queue: asyncio Semaphore, 10 concurrent LLM calls, 30s timeout. `DevelopmentConfig` vs `ProductionConfig`. `isHealthy()` on backendClient, distinct 503 UI with retry button. |

### Phase 5 — In Progress

| Block | Status |
|-------|--------|
| Day 15 (UI Polish + Onboarding) | COMPLETE — full design system overhaul, 3-step onboarding flow |
| Day 16 (Chat UI + Agent UI Polish) | **NEXT — in progress on `dev` branch** |

---

## Current Branch State (`dev`)

~30 modified files across both systems. Recent commits (newest first):

```
9b4fe7c  fix: agent parallel tool_calls, streaming wipe on new conversation, sidebar refresh, prose-ai dark mode
0ac372c  fix: rename double-fire guard, cancelled race, RequestContext params type, PATCH route tests
b86e3ea  feat: clickable tool badges, capability-showcasing suggested questions
20e35c1  fix: autoTitle success guard, rename double-submit prevention
821b2ad  feat: conversation loading on select, auto-title, inline rename
4169b6c  feat: markdown rendering in agent, prose-ai dark mode, entrance animations, step card contrast
8ebf21b  fix: search results visibility — brand-token colors on dark background
```

---

## Full System Architecture

### Python Backend (`ai-backend/`)

```
ai-backend/
├── api/
│   ├── app.py          — FastAPI app factory, CORS, lifespan
│   ├── routes.py       — All endpoints (ask, ingest, retrieve, agent, memories, cache, metrics, health)
│   └── models.py       — Pydantic request/response models
├── core/
│   ├── llm_client.py       — OpenAI wrapper, retries, complete_with_fallback()
│   ├── prompt_engine.py    — Template rendering
│   ├── prompt_registry.py  — 5 versioned prompts, single source of truth
│   ├── output_validator.py — JSON + prose validation, schema enforcement
│   ├── guardrails.py       — sanitize_input, sanitize_output, check_query
│   ├── cache.py            — LRU+TTL cache (retrieval: 5min, LLM: 1hr)
│   ├── rate_limiter.py     — Sliding window per user
│   ├── cost_controller.py  — Daily token budget per user
│   ├── request_queue.py    — asyncio.Semaphore, max 10 concurrent calls
│   ├── production_config.py— DevelopmentConfig / ProductionConfig
│   ├── retry.py            — Retry decorator with exponential backoff
│   └── config.py           — Env-based config singleton
├── rag/
│   ├── rag_interface.py    — ask() + retrieve(): guardrails → multi-query → context → LLM
│   └── context_manager.py  — Token-aware chunk selection, citation_id assignment
├── agents/
│   ├── react_agent.py      — ReAct loop via OpenAI function calling (max 8 iterations)
│   ├── router.py           — Keyword-based query router (RAG vs agent)
│   ├── factory.py          — create_agent() wires tools, RAGAdapter, optional web search
│   └── tools/
│       ├── base.py             — BaseTool ABC, ToolRegistry, ToolResult
│       ├── implementations.py  — search_documents, get_document_list, get_document_metadata, calculate
│       └── web_search.py       — Tavily WebSearchTool, graceful fallback
├── memory/
│   ├── conversation_buffer.py  — Token-aware windowing (max 2000 tokens)
│   ├── long_term_memory.py     — ChromaDB user fact store, cosine dedup ≥0.95
│   └── memory_extractor.py     — LLM-based fact extraction (gpt-4o-mini)
├── observability/
│   ├── logger.py               — Structured JSON logger → file + stdout
│   ├── tracer.py               — Request tracing
│   ├── metrics.py              — compute_metrics() reads logs → dashboard data
│   └── langchain_callback.py   — ObservabilityCallback bridging LangChain → logger
├── evals/
│   ├── eval_runner.py          — run_all(), run_llm_judge_eval(), regression detection
│   ├── llm_judge.py            — GPT-4o judge: faithfulness, relevance, completeness
│   ├── eval_dataset.json       — 20 questions (5 factual/5 inferential/5 edge/5 adversarial)
│   └── test_cases.py           — Unit eval cases
├── pipelines/
│   ├── lcel_qa_pipeline.py     — LangChain LCEL parallel retriever|prompt|llm|parser
│   └── pipeline_comparison.py  — Proves LCEL ≡ manual pipeline
├── mcp_server/
│   ├── server.py               — stdio MCP server exposing 3 tools (Claude Desktop compatible)
│   └── test_client.py          — MCP tool discovery + calculate verification
├── prompts/templates/          — qa.py, rag.py, extraction.py, summarization.py
├── main.py                     — Entry point (runs uvicorn)
└── server.py                   — Production server config
```

**Python API Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/ask` | Auto-routed question (RAG or agent) |
| GET | `/ask/stream` | SSE streaming version of /ask |
| POST | `/ingest` | Upload + ingest PDF into ChromaDB |
| POST | `/retrieve` | Raw vector retrieval |
| POST | `/agent/run` | Direct agent invocation |
| GET | `/memories` | List user long-term memories |
| DELETE | `/memories/{id}` | Delete a specific memory |
| POST | `/memories/extract` | Background memory extraction |
| GET | `/cache/stats` | Cache hit/miss stats |
| POST | `/cache/clear` | Clear all caches |
| GET | `/metrics` | Aggregated dashboard metrics from logs |
| GET | `/health` | Health check incl. cache, queue, system stats |

**AskResponse shape:**

```python
{
  answer: str,
  sources: [{ document_id, filename, content, score, citation_id }],
  guardrail_rejected: bool,
  no_results: bool,
  retrieval_quality: float,
  routed_to: "rag" | "agent"
}
```

---

### Web App (`web-app/`)

**Stack:** Next.js 16, React 19, TypeScript 6, Tailwind CSS v3 (pinned — see critical notes), Drizzle ORM, PostgreSQL, jose (JWT), Vitest

**Pages / Routes:**

| Route | Type | Description |
|-------|------|-------------|
| `/` | Marketing | Landing page |
| `/(auth)/login` | Auth | Login form (shake animation on error) |
| `/(auth)/register` | Auth | Register form |
| `/(app)/dashboard` | App | Stats + AI Observability + Recharts charts |
| `/(app)/chat` | App | Chat interface with streaming |
| `/(app)/agent` | App | ReAct agent interface with collapsible reasoning trace |
| `/(app)/documents` | App | Document grid + upload modal |
| `/(app)/documents/[id]` | App | Document detail view |
| `/(app)/search` | App | Search interface with history |
| `/(app)/settings` | App | Memory panel, account settings, data export |

**API Routes (`app/api/`):**

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/auth/register` | POST | bcrypt hash, JWT issue |
| `/api/auth/login` | POST | verify hash, JWT issue |
| `/api/auth/logout` | POST | clear cookies |
| `/api/auth/refresh` | POST | verify refresh token, reissue access token |
| `/api/ask` | POST | Proxy to Python `/ask` |
| `/api/ask/stream` | GET | SSE proxy to Python `/ask/stream` |
| `/api/agent/run` | POST | Proxy to Python `/agent/run`, saves to DB |
| `/api/documents` | GET, POST | List / upload documents |
| `/api/documents/[id]` | GET, DELETE | Document detail / delete |
| `/api/conversations` | GET, POST | List / create conversations |
| `/api/conversations/[id]` | GET, PATCH, DELETE | Get / rename / delete conversation |
| `/api/conversations/[id]/messages` | GET | List messages in conversation |
| `/api/memories` | GET | List user memories |
| `/api/memories/[id]` | DELETE | Delete a memory |
| `/api/memories/extract` | POST | Trigger memory extraction |
| `/api/dashboard/stats` | GET | Aggregate DB + Python metrics |
| `/api/dashboard/charts` | GET | Chart data |
| `/api/search` | GET | Full-text document search |
| `/api/search/history` | GET | User search history |
| `/api/queries` | GET | Query history |
| `/api/export` | GET | Data export |
| `/api/onboarding/complete` | POST | Mark onboarding done |
| `/api/onboarding/status` | GET | Get onboarding status |
| `/api/retrieve` | POST | Proxy to Python `/retrieve` |

**Database Schema (PostgreSQL via Drizzle):**

```
users              — id, email, passwordHash, tokenVersion, onboardingCompleted, createdAt
documents          — id, userId, filename, status(pending/ingested/failed), chunkCount, createdAt
queries            — id, userId, documentId, queryText, response, tokenCount, latencyMs, createdAt
conversations      — id, userId, title, createdAt, updatedAt
messages           — id, conversationId, role(user/assistant/system), content, tokenCount, createdAt
search_history     — id, userId, query, resultCount, createdAt
```

**Repositories:**

- `users.ts` — find by email, create, update token version, mark onboarding
- `documents.ts` — CRUD, list by user, update status/chunkCount
- `queries.ts` — create, list by user, aggregate stats
- `conversations.ts` — CRUD, rename, list by user
- `messages.ts` — create, list by conversation
- `search-history.ts` — create, list by user

**Hooks:**

| Hook | Purpose |
|------|---------|
| `useAsk` | Streaming ask with SSE token batching, conversation tracking |
| `useAgent` | Agent run with step streaming |
| `useAuth` | Login/register/logout + 14min auto-refresh |
| `useDocuments` | Document list + polling for pending status |
| `useUpload` | Multi-file upload queue |
| `useSearch` | Search with history |
| `useAsyncState` | Generic async state (loading/error/data) |
| `useAbortController` | Abort token management |
| `useToast` | Toast notification queue |

**UI Components (`components/ui/`):**

Button, Input, Card (3 elevation levels), Badge, Modal, Drawer, Skeleton, Spinner, Toast/ToastContainer, Alert, Divider, EmptyState, ErrorState, InlineError, PageLoader, Table, Textarea, Tooltip, StatCard, MessageBubble, DocumentCard, FileUpload, RelativeTime, Stack, AsyncBoundary, ConfirmModal, ThemeToggle, AnimatedAIChat, AccessibilityWrapper, motion/ (Framer Motion wrappers)

**Feature Components (`components/features/`):**

| Component | Description |
|-----------|-------------|
| `ChatInterface` | Full chat with streaming, conversation sidebar, auto-title |
| `AgentInterface` | Agent run with collapsible reasoning steps, markdown rendering |
| `DocumentManager` | Card grid, multi-file queue, live polling for pending docs |
| `DocumentUploadModal` | Drag-and-drop + progress indicator |
| `MemoryPanel` | View + delete long-term memories |
| `AppShell` | Client wrapper for app layout, onboarding state check |
| `FeaturesBento` | Landing page bento grid |
| `onboarding/OnboardingFlow` | 3-step flow: WelcomeStep → UploadStep → AskStep (localStorage + server sync) |

**Key Library Files (`lib/`):**

| File | Description |
|------|-------------|
| `auth.ts` | `getSession()`, `createSessionCookies()`, `clearSessionCookies()` |
| `jwt.ts` | `signAccessToken()`, `verifyAccessToken()`, `signRefreshToken()`, `verifyRefreshToken()` |
| `password.ts` | bcrypt hash/verify (cost factor 12) |
| `backend-client.ts` | Typed HTTP client for Python backend, forwards X-User-ID |
| `sse-parser.ts` | SSE event stream parser |
| `async.ts` | `debounce`, `retry`, `race`, `abortable`, `queue` |
| `middleware/withAuth.ts` | JWT-auth middleware for Next.js route handlers |
| `onboarding.ts` | `isOnboardingComplete()`, `setOnboardingComplete()` |
| `errors.ts` | Typed error hierarchy |
| `type-guards.ts` | Runtime type narrowing |
| `variants.ts` | CVA-style component variants |
| `motion.ts` | Shared Framer Motion animation presets |

---

## Technology Stack

### AI Backend (Python)

- Python 3.11+, FastAPI, Uvicorn
- `openai>=1.0.0`, `langchain>=0.3.0`, `langchain-openai`, `langchain-chroma`, `langchain-community`
- `chromadb>=1.0.0` (local file-based vector store)
- `pydantic>=2.9.0`
- `tavily-python` (web search), `mcp>=1.0.0` (MCP server)
- `unstructured[pdf]` (PDF parsing), `psutil` (system metrics)

### Web App (Next.js)

- Next.js 16, React 19, TypeScript 6
- Tailwind CSS **v3.4.x** (pinned — must NOT upgrade to v4)
- Drizzle ORM v0.45, `postgres` driver
- `jose` v6 (JWT), `bcryptjs` v3
- Framer Motion v12, Radix UI (full suite), Recharts v3
- `react-markdown`, `react-syntax-highlighter`, `remark-gfm`, `rehype-highlight`
- `zod` v4, `lucide-react`, `date-fns`, `clsx`, `tailwind-merge`
- Vitest v4 + Testing Library + jsdom

---

## Test Coverage

### Python (pytest)

| File | What it tests |
|------|--------------|
| `test_api.py` | All FastAPI endpoints (34 tests) |
| `test_llm_client.py` | LLM wrapper + fallback chain |
| `test_prompt_engine.py` | Template rendering |
| `test_rag_interface.py` | Full RAG pipeline |
| `test_guardrails.py` | Input/output sanitization |
| `test_output_validator.py` | JSON + prose validation |
| `test_context_manager.py` | Token-aware chunk selection |
| `test_cache.py` | LRU+TTL cache |
| `test_metrics.py` | Log aggregation → metrics |
| `test_agent.py` | ReAct agent loop |
| `test_tools.py` | All 4 tools |
| `test_web_search_tool.py` | Tavily tool + fallback |
| `test_conversation_buffer.py` | Token windowing |
| `test_long_term_memory.py` | ChromaDB memory store |
| `test_memory_extractor.py` | LLM extraction |
| `test_lcel_pipeline.py` | LCEL pipeline equivalence |
| `test_mcp_server.py` | MCP tool discovery |
| `test_rate_limiter.py` | Sliding window rate limit |
| `test_cost_controller.py` | Token budget |
| `test_request_queue.py` | Semaphore queue |
| `test_llm_judge.py` | LLM-as-judge eval |
| `test_full_pipeline.py` | End-to-end smoke |
| `test_smoke.py` | Skips if server not running |

### TypeScript (Vitest)

| File | What it tests |
|------|--------------|
| `api/auth.test.ts` | Auth routes (13 tests) |
| `api/ask-stream.test.ts` | SSE streaming route (10 tests) |
| `api/conversations-patch.test.ts` | PATCH /conversations/[id] |
| `api/dashboard.test.ts` | Dashboard stats aggregation |
| `api/documents.test.ts` | Document CRUD routes |
| `api/edge-cases.test.ts` | Error/edge case handling |
| `hooks/useAgent.test.ts` | useAgent hook (7 tests) |
| `hooks/useAsk.test.ts` | useAsk streaming hook |
| `hooks/useAsyncState.test.ts` | Generic async state |
| `hooks/useAbortController.test.ts` | Abort management |
| `hooks/useDocuments.test.ts` | Document polling |
| `hooks/useUpload.test.ts` | Upload queue |
| `lib/async.test.ts` | Async utilities (22 tests) |
| `lib/jwt.test.ts` | JWT sign/verify (17 tests) |
| `lib/password.test.ts` | bcrypt (10 tests) |
| `lib/sse-parser.test.ts` | SSE parser (22 tests) |

---

## Critical Infrastructure Notes (NEVER change these)

1. **Tailwind CSS must stay on v3.x** — v4 breaks all existing config and globals.css syntax
2. **`postcss.config.js` must exist** with `tailwindcss: {}` and `autoprefixer: {}` — required by Turbopack
3. **`next.config.ts` must have** `turbopack: { root: process.cwd() }` — fixes module resolution
4. **`@keyframes` must NOT be inside `@layer`** in globals.css — Turbopack parser limitation
5. **`@apply` must use valid v3 class names** — invalid names silently break the entire stylesheet
6. **`drizzle.config.ts` loads `.env.local` before `.env`** — app DB is `ai_product_dev`

---

## Environment Variables

### `ai-backend/.env`

```
OPENAI_API_KEY=...
MODEL_NAME=gpt-4o
FAST_MODEL=gpt-4o-mini
TEMPERATURE=0.0
MAX_TOKENS=2000
LOG_LEVEL=INFO
LOG_FILE=logs/ai_backend.log
TAVILY_API_KEY=...  (optional — web search degrades gracefully without it)
MAX_QUERY_CHARS=2000
RELEVANCE_THRESHOLD=0.65
```

### `web-app/.env.local`

```
DATABASE_URL=postgresql://localhost:5432/ai_product_dev
DATABASE_URL_TEST=postgresql://localhost:5432/ai_product_test
NEXT_PUBLIC_AI_BACKEND_URL=http://localhost:8000
JWT_SECRET=...
JWT_REFRESH_SECRET=...
LOG_LEVEL=debug
```

---

## Known Limitations (documented)

- Rate limiter + cost controller are **in-memory only** (no Redis — not suitable for multi-instance)
- ChromaDB is **local file-based** — not suitable for multi-instance deployment
- Auth tokens are **not forwarded** to the MCP server
- Smoke test requires **manual server startup** (not automated in CI)
- Python backend trusts `X-User-ID` header from Next.js (no direct JWT verification on Python side)
- Dashboard AI metrics are `null` when Python backend is down (non-fatal graceful degradation)

---

## How to Run

```bash
# Python backend
cd ai-backend
source ../venv/bin/activate
python main.py        # starts on http://localhost:8000

# Web app
cd web-app
npm run dev           # starts on http://localhost:3000

# Tests
cd ai-backend && pytest
cd web-app && npm test
```

---

## What Comes Next (Phase 5 remaining)

Based on the syllabus (Days 16–40):

- **Day 16** — Chat UI + Agent UI polish (in progress)
- **Day 33** — Backend API design review
- **Day 34** — Document upload UI improvements
- **Day 35** — Chat UI final polish
- **Day 36** — Retrieval UI
- **Day 37** — Dashboard improvements
- **Day 38** — Testing pass (integration tests)
- **Day 39** — Deployment (Docker, cloud hosting)
- **Day 40** — Final packaging + portfolio presentation

---

## Architecture Decisions (from `docs/architecture.md`)

- **ADR-001**: ChromaDB for vector storage (local file, simplicity over scale)
- **ADR-002**: Manual agent loop over LangChain agents (clarity + control)
- **ADR-003**: stdio MCP transport (Claude Desktop integration simplicity)
- **ADR-004**: In-memory rate limiting (sufficient for single-instance, documented limitation)
- **Fine-tuning decision**: Not appropriate at this stage — documented in `docs/fine_tuning_decision.md`
- **LangChain usage boundary**: ONLY for LCEL chains and observability callbacks; all other logic is manual

---

*Generated from codebase state on dev branch — 2026-06-21*
