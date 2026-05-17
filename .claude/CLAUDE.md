# AI Product — Project Instructions for Claude Code

## What This Project Is

A production-level AI-powered full-stack product being built over a 40-day structured plan.
Three interconnected systems:

1. AI backend (Python) — LLM wrapper, RAG pipeline, observability, evals, agents
2. Web app (Next.js + TypeScript) — full-stack frontend with API routes
3. Integration layer — connects AI backend to web app

## Current Status

- Days 1-2: AI backend foundation complete (llm_client, prompt_engine, rag_interface, logger, tracer, eval_runner)
- Days 3-8: AI backend hardened (observability, evals, refactor)
- Days 9-10: Async utilities complete (lib/async.ts, services/base-service.ts, services/ai-service.ts)
- Days 11-12: HTTP middleware + database layer complete
- Days 13-14: TypeScript type system + React hooks + UI components complete
- Days 15-16: Next.js app structure + complete UI component library complete
- Day 6 Block 6: Phase 1+2 fully verified — 0 TS errors, 105/105 tests passing, tagged v0.2-phase2-complete
  - server-only boundaries enforced (db/connection, repositories, lib/auth)
  - Branded ID types with domain mappers at repository boundary
  - All hardcoded colors replaced with design tokens across all components
  - AccessibilityWrapper (aria-live) mounted in root layout
  - error-logger wired into middleware, base-service, error boundary
  - resilientCall timeout/cancellation disambiguation fixed
  - useAsk abort race condition fixed
  - Barrel exports complete: hooks/index.ts, components/ui/index.ts

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

- Auth is stubbed — real implementation comes on Day 19
- AI backend URL is localhost — real integration comes on Day 17-18

## What Claude Code Should Do on Every Session Start

1. Read this file completely
2. Run `npx tsc --noEmit` in web-app/ — note any existing errors
3. Check git status — understand what is in progress
4. Ask what block or task to work on if not specified in the prompt
