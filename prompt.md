# Production Hardening + Deployment — AI Product

> Give this whole file to Claude Code as the task prompt. Goal: by the end of the session, this project is deployed and live at a public URL, with no known loose ends. Work phase by phase, in order — later phases assume earlier ones are done. Update `docs/superpowers/plans/` status notes and `.claude/CLAUDE.md` "Current Status" as you complete each phase, the same way prior days of this project were logged.

## Project context

Full-stack AI product: Next.js 16 web app (`web-app/`) + Python FastAPI RAG/agent backend (`ai-backend/`), connected via a server-side proxy layer. Auth is real JWT (jose + bcrypt). RAG uses ChromaDB (two collections: OpenAI embeddings for the owner tier, HuggingFace local embeddings for everyone else — see "tiered API access" below). Agents use OpenAI function calling with 4 tools + optional Tavily web search. Memory system (short-term buffer + long-term ChromaDB fact store) is wired in. Guardrails, prompt versioning, output validation, rate limiting, cost budgeting, and request queuing all exist already. Full status history is in `.claude/CLAUDE.md` — read it first, it is the source of truth for what's been built and why.

**Tiered access (already implemented, don't redesign it):** requests carry an `X-User-Email` header forwarded by Next.js from the verified JWT session. The Python backend resolves a tier per request — the owner email (`OWNER_EMAIL` env var) gets OpenAI GPT-4o + `text-embedding-3-small`; everyone else gets Groq `llama-3.3-70b-versatile` + local HuggingFace embeddings. Evals always use GPT-4o as judge regardless of tier. Preserve this behavior exactly.

**Deployment target (already decided, don't re-litigate):**
- Next.js → **Vercel** (root directory set to `web-app/` in project settings — this is a monorepo, Vercel needs this configured manually in its dashboard, note it but you can't do it yourself)
- Python backend + Postgres → **Railway**, with a persistent volume for the ChromaDB data directory
- Vector store stays **local ChromaDB on a persistent volume** — no migration to a hosted vector DB. This is a deliberate scope decision, not an oversight.
- Rate limiter / cost controller / request queue **stay in-memory** — this deploy targets personal/portfolio-scale traffic on a single instance, not horizontal scaling. Document the limitation, don't build Redis-backed versions.
- Git history: **do not rewrite git history.** Untrack the files below going forward only. No real secrets were ever committed (verified — only dev placeholder values like `dev-secret-change-in-production`), so a history scrub isn't warranted.

## Global constraints (from `.claude/CLAUDE.md` — do not violate)

- Tailwind CSS stays on v3.x — never upgrade to v4, it silently breaks all CSS in this codebase. `postcss.config.js`, `next.config.ts` (with `turbopack: { root: process.cwd() }`), and the `@keyframes`-outside-`@layer` rule in `globals.css` are permanent infra decisions — do not touch them except to verify they still hold.
- Zero `any` types in TypeScript. No hardcoded colors (design tokens only). No `print()` in Python production paths — structured logger only. No bare `except:` in Python. No raw `fetch()` in components — go through `AIService`. No DB queries in route handlers — go through repositories.
- Every public function keeps its type hints / TypeScript types and one-line docstring.
- Run the existing test suites before and after your changes; don't mark anything done without green tests. `cd ai-backend && pytest`, `cd web-app && npm test && npx tsc --noEmit && npx eslint . --ext .ts,.tsx --max-warnings 0`.

---

## Phase 1 — Fix real bugs found during the pre-hardening audit

These are confirmed, concrete issues in the current code, not hypothetical hardening advice. Fix all of them.

### 1a. CORS is hardcoded and ignores production config (real bug)

`ai-backend/api/app.py` lines 46–56 hardcode:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    ...
)
```
Meanwhile `ai-backend/core/production_config.py` defines a `ProductionConfig.CORS_ORIGINS` that reads `FRONTEND_URL` from the environment and raises if it's missing in production — **but nothing in `app.py` ever calls `get_config()` or uses `CORS_ORIGINS`.** It's dead code. In production this means either the deployed frontend gets CORS-blocked, or (worse) the wildcard localhost origins ship to prod doing nothing useful.

Fix: import `get_config` from `core.production_config` in `app.py` and pass `cfg.CORS_ORIGINS` as `allow_origins`. Keep local dev working (`DevelopmentConfig.CORS_ORIGINS` already includes the localhost origins). Add/update a test in `ai-backend/tests/` that asserts `ProductionConfig` origins are actually threaded into the FastAPI app's CORS middleware config (not just that the dataclass computes the right list — assert on `app.user_middleware` or an equivalent introspection so this can't regress silently again).

### 1b. Untracked-but-committed files (git hygiene)

Three things are currently tracked in git that shouldn't be:
- `web-app/.env.local` — tracked since early commits. Contains only dev placeholder secrets (`JWT_SECRET=dev-secret-change-in-production`, `AI_BACKEND_API_KEY=dev-internal-key-change-in-production`, local Postgres URLs) — nothing sensitive leaked, but it must stop being tracked before real production secrets ever get set locally in this same file.
- `ai-backend/rag/db/chroma_db/*` (5 files, ~5.3MB) — this is a **stale, unused duplicate**. The code actually reads/writes ChromaDB from `ai-backend/external/rag_system/db/chroma_db` (see `rag/rag_interface.py` `_PERSIST_DIR` / `_PERSIST_DIR_HF`), which is already correctly gitignored via the `external/` pattern. `ai-backend/rag/db/chroma_db` is dead weight from an old commit, not read by any current code path.
- `web-app/tsconfig.tsbuildinfo` — a TypeScript incremental build artifact, shouldn't be versioned (it's what's showing up as a spuriously modified file in `git status` right now).

Do this:
```bash
git rm --cached web-app/.env.local
git rm -r --cached ai-backend/rag/db/chroma_db
git rm --cached web-app/tsconfig.tsbuildinfo
```
Add to `.gitignore` (root): `tsconfig.tsbuildinfo`. The `web-app/.env.local` pattern and `chroma_db/` pattern already exist in `.gitignore` — verify `git status` shows all three as clean/untracked after this, then commit as its own dedicated commit (e.g. `chore: stop tracking local env file, stale chroma data, and build artifact`).

### 1c. Absolute-rule audit (grep, don't assume)

Run these and fix any hits in production code paths (exclude tests/venv/node_modules):
```bash
grep -rn "print(" ai-backend --include="*.py" | grep -v -E "tests/|venv/|main\.py"
grep -rn "except:" ai-backend --include="*.py" | grep -v -E "tests/|venv/"
grep -rn ": any\b\|as any\b" web-app --include="*.ts" --include="*.tsx" | grep -v -E "node_modules/|\.next/"
```
`main.py`'s `print()` calls are CLI output for a script entrypoint, not a production request path — leave those. Anything under `api/`, `core/`, `rag/`, `agents/`, `memory/`, `observability/` that uses `print()` or bare `except:` must be fixed to use the structured logger / a specific exception type.

---

## Phase 2 — Secrets and environment configuration

1. Generate strong production secrets (don't reuse the dev placeholders anywhere in production):
   ```bash
   openssl rand -base64 48   # JWT_SECRET
   openssl rand -base64 32   # AI_BACKEND_API_KEY / INTERNAL_API_KEY — must be the SAME value in both Vercel and Railway env vars, it's a shared secret between the Next.js proxy and the Python backend's api_key_middleware in api/app.py
   ```
2. Full production env var list to set (in the two hosting dashboards, never committed to git):

   **Railway (`ai-backend`):**
   ```
   ENVIRONMENT=production
   FRONTEND_URL=https://<your-vercel-domain>
   OPENAI_API_KEY=<real key>
   MODEL_NAME=gpt-4o
   TEMPERATURE=0.0
   MAX_TOKENS=2000
   GROQ_API_KEY=<real key>
   TAVILY_API_KEY=<real key or omit — WebSearchTool degrades gracefully if unset>
   OWNER_EMAIL=rautanurag9@gmail.com
   INTERNAL_API_KEY=<generated secret, must match AI_BACKEND_API_KEY in Vercel>
   LOG_LEVEL=WARNING
   LOG_FILE=logs/ai_backend.log
   DATABASE_URL=<Railway managed Postgres URL, if the Python side needs direct DB access — check ai-backend/core for any direct DB usage before assuming it needs this>
   ```
   **Vercel (`web-app`):**
   ```
   DATABASE_URL=<Railway managed Postgres URL — same Postgres instance as above>
   JWT_SECRET=<generated secret>
   NEXT_PUBLIC_AI_BACKEND_URL=<Railway public URL for the ai-backend service>
   AI_BACKEND_URL=<same Railway URL>
   AI_BACKEND_API_KEY=<same value as Railway's INTERNAL_API_KEY>
   NEXT_PUBLIC_APP_URL=https://<your-vercel-domain>
   LOG_LEVEL=warning
   ```
   Cross-check the exact required var names against `web-app/lib/config.ts` (`serverVars` array) and `ai-backend/core/config.py` before finalizing — those two files are the actual source of truth for what's required vs optional, use them instead of guessing.
3. Confirm `web-app/lib/auth.ts` cookie flags (`secure: process.env.NODE_ENV === 'production'`) will correctly be `true` in the Vercel deployment (Vercel sets `NODE_ENV=production` automatically for `next build`/`next start` — verify, don't assume).

---

## Phase 3 — Containerize the Python backend for Railway

1. Create `ai-backend/Dockerfile`:
   - Base on `python:3.11-slim`
   - Install `requirements.txt`
   - Copy the app
   - Run as a non-root user
   - `CMD` should run `server.py` (which already reads `API_PORT` and uses `core.production_config.get_config()` for reload/log-level) — don't reimplement uvicorn invocation logic that already exists in `server.py`
   - Add a `HEALTHCHECK` hitting `GET /health` (already implemented, includes cache/queue/memory stats)
2. Create `ai-backend/.dockerignore`: exclude `venv/`, `__pycache__/`, `.pytest_cache/`, `tests/`, `external/`, `chroma_db/`, `logs/`, `.env`, `*.pyc`
3. Note: `chroma_db` at `external/rag_system/db/chroma_db` must persist across deploys — this needs a Railway volume mounted at that path. Document the exact mount path in a new `docs/deployment.md` (see Phase 6) so it's not lost/misconfigured on a future redeploy.
4. `sentence-transformers` was recently added to `requirements.txt` (see commit `63256ed`) for local HuggingFace embeddings on the free tier — confirm the Docker image actually installs and runs it correctly (it pulls a model on first use; check whether that download needs to happen at build time vs runtime, and whether the Railway volume needs to persist the HF model cache directory too, or it'll re-download on every cold start).

---

## Phase 4 — Database migrations

`web-app/drizzle.config.ts` already points at `./db/migrations` (source of truth, committed to git). Before or as part of the Vercel deploy:
```bash
DATABASE_URL=<Railway production Postgres URL> npx drizzle-kit migrate
```
run this once against the production database (from your machine or a one-off Railway job — not from inside the Vercel build, which shouldn't have long-lived DB migration responsibilities). Confirm all tables + indexes from `web-app/db/schema.ts` exist in prod afterward (there's a `db/verify-indexes.ts` but it can't run standalone per the known issue in `.claude/CLAUDE.md` — check indexes manually via `psql \d+ <table>` against the prod DB instead).

---

## Phase 5 — Pre-deploy verification (must be green before Phase 6)

Run all of these and fix any failures — do not deploy on red:
```bash
cd ai-backend && pytest tests/ -v --tb=short --ignore=tests/test_smoke.py
cd web-app && npm test
cd web-app && npx tsc --noEmit
cd web-app && npx eslint . --ext .ts,.tsx --max-warnings 0
cd web-app && npm run build
```
The most recent commits (`fix: install sentence-transformers`, `fix: add retry wrapper to Groq path`, `fix: agent RAGAdapter tier isolation, HF→OpenAI fallback, tier-scoped cache keys`) suggest the tiered-access feature was recently stabilizing — pay particular attention to the Groq fallback path and HF↔OpenAI tier isolation tests actually passing, since that's the newest and least battle-tested code in the system. If `npm run build` succeeds, additionally start it with `npm start` locally once and manually click through: register → login → upload a doc → ask a question → check an agent-routed query → check `/settings` memory panel — a clean `tsc`/build pass does not guarantee the deployed UI actually works, verify it visually per the project's UI-testing convention.

---

## Phase 6 — Deploy

1. Railway: create a new project, add a Postgres plugin, deploy `ai-backend/` as a service from this repo (root directory `ai-backend/`), attach the persistent volume (Phase 3), set all env vars (Phase 2), confirm `/health` returns 200 with `cache`, `queue`, and `memory` stats populated.
2. Vercel: import this repo, **set the project's root directory to `web-app/`** in project settings (do this in the Vercel dashboard — this is the one manual step you can't script), set all env vars (Phase 2), deploy.
3. Run the Phase 4 migration against the production DATABASE_URL.
4. Full production smoke test: hit the live Vercel URL, register a real account, log in, upload a PDF, ask a question through both the RAG path and a query complex enough to route to the agent, confirm citations render, confirm the owner email gets routed to OpenAI (check response latency/logs) and a non-owner test account gets routed to Groq/HF.
5. Confirm CORS actually works end-to-end from the live Vercel domain (this directly exercises the Phase 1a fix) — a failed CORS preflight is the most likely first-deploy failure mode here.

---

## Phase 7 — Close out loose ends

1. Write `docs/deployment.md`: hosting layout (Vercel + Railway), all env vars required (names only, no values), the ChromaDB volume mount path and why it must persist, the drizzle migration command, and a rollback note (how to redeploy the previous Railway/Vercel deployment if something breaks).
2. Update `.claude/CLAUDE.md` "Current Status" section with a new entry: `Day 17 (Pre-deploy hardening + launch): COMPLETE` summarizing what changed (CORS fix, git hygiene, Dockerfile, deploy) — follow the exact terse bullet style already used for every prior day in that file.
3. Update the "Known Limitations" section in `.claude/CLAUDE.md`: keep the in-memory rate limiter / cost controller / single-instance ChromaDB entries (deliberately deferred, not fixed), but remove any limitations this session actually resolved.
4. Final checklist — confirm every item is actually true, don't just assert it:
   - [ ] No secrets anywhere in git (tracked files or history) beyond dev placeholders that were already there
   - [ ] `ai-backend/rag/db/chroma_db`, `web-app/.env.local`, `web-app/tsconfig.tsbuildinfo` no longer tracked
   - [ ] CORS reads from `ProductionConfig`/`DevelopmentConfig` in `app.py`, not hardcoded
   - [ ] All Python tests pass, all TypeScript tests pass, `tsc --noEmit` clean, eslint clean, `npm run build` clean
   - [ ] Live Vercel URL loads, auth works, upload works, ask works (both RAG and agent routing), tiered routing verified for owner vs non-owner
   - [ ] `/health` on the deployed Railway service returns 200 with real stats
   - [ ] `docs/deployment.md` exists and is accurate
   - [ ] `.claude/CLAUDE.md` status section reflects reality
