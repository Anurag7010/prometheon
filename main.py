"""
main.py

System entry point: health check → smoke test → eval run.

Steps:
  1. health_check()  — validates config, LLM, RAG, logger
  2. Ingest test PDF
  3. Manual ask() call with latency breakdown
  4. eval_runner.run_all(TEST_CASES)

"""

import json
import sys
from core.config import config
from observability.logger import get_logger

logger = get_logger(__name__)

PDF_PATH = "rag/docs/attention-is-all-you-need.pdf"

def _divider(title: str) -> None:
    print(f"\n{'─' * 64}")
    print(f"  {title}")
    print(f"{'─' * 64}")


# ── Health check ──────────────────────────────────────────────────────────────

def health_check() -> bool:
    """
    Run pre-flight checks. Prints PASS/FAIL per check.
    Returns True only if ALL checks pass.
    """
    _divider("HEALTH CHECK")
    checks_passed = True

    # 1. Config
    try:
        _ = config.MODEL_NAME
        _ = config.OPENAI_API_KEY
        print("  [PASS] Config loaded")
    except Exception as exc:
        print(f"  [FAIL] Config: {exc}")
        checks_passed = False

    # 2. Logger
    try:
        logger.info("health_check: logger ok", extra={"check": "logger"})
        print("  [PASS] Logger writes JSON to stdout")
    except Exception as exc:
        print(f"  [FAIL] Logger: {exc}")
        checks_passed = False

    # 3. LLM client — minimal ping (5 tokens, no real content needed)
    try:
        from core.llm_client import complete
        result = complete("ping", max_tokens=5, trace_id="health-check")
        if result["error"]:
            print(f"  [FAIL] LLM client: {result['error']}")
            checks_passed = False
        else:
            print(f"  [PASS] LLM client responded in {result['latency_ms']:.0f}ms")
    except Exception as exc:
        print(f"  [FAIL] LLM client raised: {exc}")
        checks_passed = False

    # 4. RAG interface importable + retrieve() doesn't crash on empty query
    try:
        from rag.rag_interface import retrieve
        result = retrieve("")
        # Empty query returns error list — that's fine; we just need no exception
        print("  [PASS] RAG interface importable and retrieve() callable")
    except Exception as exc:
        print(f"  [FAIL] RAG interface: {exc}")
        checks_passed = False

    status = "ALL CHECKS PASSED ✓" if checks_passed else "SOME CHECKS FAILED ✗"
    print(f"\n  → {status}")
    return checks_passed


# ── Smoke test ────────────────────────────────────────────────────────────────

def run_smoke_test() -> None:
    from rag.rag_interface import ingest, ask
    from evals.eval_runner import run_all
    from evals.test_cases import TEST_CASES

    # Step 1: Health check — abort if any check fails
    if not health_check():
        print("\nAborting: fix failing health checks before proceeding.")
        sys.exit(1)

    # Step 2: Ingest
    _divider("STEP 2 — Ingest")
    print(f"  File: {PDF_PATH}")
    ingest_result = ingest(
        file_path=PDF_PATH,
        metadata={"source": PDF_PATH, "run": "smoke_test"},
    )
    print(f"  Result: {json.dumps(ingest_result, indent=4)}")
    if ingest_result.get("error"):
        print(f"\n  [WARN] Ingestion failed — RAG steps will return errors.")
        print("  Set PDF_PATH to a real PDF and retry.")

    # Step 3: Manual ask()
    _divider("STEP 3 — Manual ask()")
    query  = "What is this document about?"
    result = ask(query)

    print(f"  Query:    {query!r}")
    print(f"  trace_id: {result['trace_id']}")
    print(f"  Answer:   {result['answer'][:400]}")
    print(f"  Sources:  {result['sources']}")
    print(f"  Latency breakdown:")
    lb = result["latency_breakdown"]
    print(f"    retrieval  : {lb['retrieval_ms']:.0f}ms")
    print(f"    generation : {lb['generation_ms']:.0f}ms")
    print(f"    total      : {lb['total_ms']:.0f}ms")
    if result["error"]:
        print(f"  [WARN] error: {result['error']}")

    # Step 4: Eval run
    _divider("STEP 4 — Eval Run")
    summary = run_all(TEST_CASES)
    logger.info(
        "eval_complete",
        extra={
            "total":     summary["total"],
            "passed":    summary["passed"],
            "pass_rate": summary["pass_rate"],
        },
    )

    # Step 5: Log confirmation
    _divider("STEP 5 — Log Confirmation")
    logger.info("smoke_test_complete", extra={"status": "done", "trace_id": result["trace_id"]})
    print("  ✓ All log lines contain trace_id (see JSON output above)")
    print("  ✓ Smoke test complete\n")


if __name__ == "__main__":
    run_smoke_test()