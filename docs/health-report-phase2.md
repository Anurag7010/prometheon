# Phase 2 Health Report — Day 6 Block 6

**Date:** 2026-05-17  
**Tag:** `v0.2-phase2-complete`  
**Branch:** `learn`

---

## Test Results

| Suite | Pass | Fail | Notes |
|---|---|---|---|
| `tests/lib/async.test.ts` | 17 | 0 | withRetry, withTimeout, withCancellation, resilientCall |
| `tests/hooks/*.test.ts` | 20 | 0 | useAsyncState, useAbortController, useAsk, useDocuments, useUpload |
| `tests/components/*.test.ts` | 13 | 0 | FileUpload, MessageBubble, DocumentCard |
| `tests/services/*.test.ts` | 29 | 0 | BaseService, AIService |
| `tests/api/*.test.ts` | 11 | 0 | Documents route handler (with mocked DB) |
| `tests/repositories/*.test.ts` | 0 | 3 (skip) | Require DATABASE_URL_TEST — no local Postgres |

**Total: 105 passed, 0 failures, 3 infra-skipped**

---

## TypeScript

```
npx tsc --noEmit → 0 errors
```

---

## Architecture Checks

### Server-Only Boundaries
- `db/connection.ts` — `import 'server-only'` ✓
- `db/repositories/documents.ts` — `import 'server-only'` ✓
- `db/repositories/queries.ts` — `import 'server-only'` ✓
- `lib/auth.ts` — `import 'server-only'` ✓

### Branded ID Types
- `UserId`, `DocumentId`, `QueryId` brand types defined in `types/index.ts`
- Domain mapper functions in each repository (`toDomainDocument`, `toDomainQuery`)
- `withAuth.ts` uses `toUserId()` — no `as string` casts at auth boundary

### Design Tokens
- All hardcoded Tailwind color classes (`gray-*`, `blue-*`, `white`, `black`) replaced with CSS variable tokens across:
  - `Sidebar`, `NavLink`, `SignOutButton`
  - `MessageBubble`, `DocumentCard`, `FileUpload`, `FileUpload`
  - `ChatInterface`, `DocumentManager`
  - `Modal`, `Drawer`, `error.tsx`

### Accessibility
- `AccessibilityWrapper` mounted in `app/layout.tsx`
- `aria-live="polite"` region announces route changes to screen readers
- `Sidebar` has `role="navigation" aria-label="Main navigation"`

### Error Logging
- `lib/error-logger.ts` created — `logError` / `logWarning` with structured output
- `withErrorHandler` middleware uses `logError` (replaces `console.error`)
- `BaseService` logs network + 5xx errors via `logError`
- `app/error.tsx` error boundary uses `logError`

### Env Validation
- `lib/config.ts` validates all required env vars at startup (server-side only)
- `web-app/.env.example` and `ai-backend/.env.example` documented

### Barrel Exports
- `components/ui/index.ts` — all ~30 UI components
- `hooks/index.ts` — all 6 hooks
- `types/index.ts` — all types, guards, brand constructors

---

## Key Bug Fixes

### `resilientCall` timeout/cancellation disambiguation
Previously, `CancellationError` thrown by `withCancellation` (on internal timeout abort) was indistinguishable from external caller cancellation. Fix: check `attemptController.signal.aborted` — if true, it was our internal timeout; convert to `TimeoutError` and retry. If false, `fn` threw `CancellationError` directly — preserve and throw.

### `useAsk` abort race condition
Destructuring `signal` at hook init captured the pre-reset aborted signal, causing all subsequent asks to immediately cancel. Fix: store the `abortCtrl` object reference; read `abortCtrl.signal` after `reset()` to get the fresh signal; use `currentSignal` guard inside `execute()`.

### `withRetry` CancellationError propagation
`CancellationError` was passing through `isRetryable` (returning `false`) but the function was still breaking out of the loop and throwing `RetryExhaustedError`. Fix: explicit `throw err` on `CancellationError` before the retryable check.

---

## AI Backend Status

- Core pipeline: `llm_client`, `prompt_engine`, `rag_interface` — complete
- Observability: `logger`, `tracer` — complete
- Evals: `eval_runner`, `test_cases` — complete
- `main.py`: `--health-check` CLI flag added for CI health probes

---

## Ready for Phase 3

- Integration: Days 17-18 (AI backend ↔ web app)
- Auth: Day 19 (real JWT implementation)
- Agents: Days 20+
