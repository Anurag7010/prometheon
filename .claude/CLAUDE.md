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
- Next: Day 9 — Caching + Performance + AI Observability

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

### Git

- Commit after every completed block
- Commit message format: "day{N}-block{N}: {what was built}"
- Never commit with TypeScript errors
- Never commit with failing tests

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

## What Claude Code Should Do on Every Session Start

1. Read this file completely
2. Run `npx tsc --noEmit` in web-app/ — note any existing errors
3. Check git status — understand what is in progress
4. Ask what block or task to work on if not specified in the prompt
