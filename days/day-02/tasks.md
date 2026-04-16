# Day 02 — Tasks

## Status: ✅ Complete

---

## Built

| File                       | Status  | Notes                                              |
| -------------------------- | ------- | -------------------------------------------------- |
| `core/retry.py`            | ✅ Done | Exponential backoff, retryable/non-retryable split |
| `core/llm_client.py`       | ✅ Done | Full implementation (was stub on Day 1)            |
| `tests/test_llm_client.py` | ✅ Done | 15 tests, all green, zero real API calls           |

---

## What `core/llm_client.py` now does

- `call_llm(prompt, ...)` → plain string response
- `call_llm_structured(prompt, schema, ...)` → validated Pydantic model
- Logs: model, temperature, latency_ms, token counts, estimated USD cost per call
- Retry: up to 3 attempts with 1s/2s backoff on transient OpenAI errors
- Per-call overrides for model, temperature, max_tokens

## What `core/retry.py` does

- `@with_retry(max_attempts, base_delay, backoff_factor, retryable_exceptions)`
- Skips retry for non-retryable HTTP status codes (400, 401)
- Logs each retry attempt with remaining count + delay
- Logs final failure with full error before re-raising

---

## Verified

- [x] 15/15 unit tests pass (`pytest tests/test_llm_client.py -v`)
- [x] Retry fires on transient errors, not on TypeError
- [x] Structured output rejects bad JSON with ValueError
- [x] Structured output rejects valid JSON that fails schema with ValueError
- [x] Markdown fence stripping works
- [x] Cost estimate is zero for unknown models (not a crash)

---

## Next: Day 03

- Implement `core/prompt_engine.py` fully
- Build `prompts/` directory: templates/, registry.py, builder.py, models.py
- Template types: QA, summarization, extraction, RAG
