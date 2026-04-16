# Day 01 — Tasks

---

## Built

| File                       | Status  | Notes                                  |
| -------------------------- | ------- | -------------------------------------- |
| `core/config.py`           | ✅ Done | Typed Config, loud failures, singleton |
| `core/llm_client.py`       | ✅ Stub | Day 2                                  |
| `core/prompt_engine.py`    | ✅ Stub | Day 3                                  |
| `observability/logger.py`  | ✅ Done | Structured, level-driven               |
| `rag/rag_interface.py`     | ✅ Stub | Day 4                                  |
| `pipelines/qa_pipeline.py` | ✅ Stub | Day 4–5                                |
| `evals/eval_runner.py`     | ✅ Stub | Day 6                                  |
| `requirements.txt`         | ✅ Done | All deps pinned                        |
| `.env.example`             | ✅ Done | No real keys                           |
| `main.py`                  | ✅ Done | Startup confirmation                   |
| All `__init__.py`          | ✅ Done | All modules importable                 |
| `days/day-01/`             | ✅ Done | This file                              |

---

## Verified

- [x] `python main.py` runs without crash
- [x] Config loads from `.env`
- [x] Missing `OPENAI_API_KEY` raises `EnvironmentError` with clear message
- [x] Logger outputs structured lines with timestamp + module name
- [x] All stubs raise `NotImplementedError` (not silent)

---
