# Day 02 — Notes

## Concepts

### Retry with Exponential Backoff

- `@with_retry` is a decorator factory — it wraps any function, not just LLM calls
- Exponential backoff: delay doubles each attempt (1s → 2s → 4s)
- Retryable vs non-retryable distinction is critical:
  - HTTP 429 (rate limit), 5xx (server error), timeout → retry
  - HTTP 400 (bad request), 401 (auth) → propagate immediately, no retry
- `functools.wraps` preserves the wrapped function's name and docstring
- `status_code` is read off the exception itself (OpenAI sets this attribute)

### Structured Outputs via Pydantic

- `call_llm_structured()` injects the JSON schema into the system prompt
- Two failure points: JSON parse error, Pydantic validation error — both caught separately
- Stripping markdown fences (` ```json `) is mandatory — models add them even when told not to
- `model_json_schema()` is Pydantic v2's way to get the schema dict for a model class
- `model_validate()` is Pydantic v2's equivalent of `parse_obj()` in v1

### Cost Tracking

- Cost = (input_tokens / 1000) _ input_rate + (output_tokens / 1000) _ output_rate
- Logged per call, not aggregated — aggregation is an observability concern (Day 5)
- Unknown models return 0.0 (safe default) rather than crashing

### Mocking in Tests

- `unittest.mock.patch` intercepts `_call_openai` at the module level
- `MagicMock()` simulates the OpenAI response object with attribute chains
- Tests verify: happy path, overrides, error handling, JSON edge cases — not just "it works"
- No real API calls in tests → fast, free, deterministic
