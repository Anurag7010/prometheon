# Day 01 — Notes

## Concepts

### Config as a Singleton

- `Config.load()` reads all env vars at import time
- Frozen dataclass → immutable, no accidental mutation
- `_require()` vs `_optional()` distinction: API keys fail loudly, tuning params have safe defaults
- Single import everywhere: `from core.config import config`

### Structured Logging

- All modules call `get_logger(__name__)` — names trace to exact module
- Avoids duplicate handlers via early return if logger already configured
- Log level driven by `config.LOG_LEVEL` → configurable per environment

### Stubs as Contracts

- Stubs with `raise NotImplementedError` are better than empty functions
- They document the intended signature and responsibility of each module
- They fail explicitly if wired incorrectly — no silent no-ops

### Module Boundaries

- `core/` → system-wide primitives (config, LLM client, prompt engine)
- `rag/` → RAG interface only — wraps external system, does not own it
- `pipelines/` → orchestration — combines core + rag, owns no logic itself
- `observability/` → cross-cutting concern, imported by all modules
- `evals/` → separate concern, runs outside normal request flow
