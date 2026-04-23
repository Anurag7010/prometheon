"""
evals/eval_runner.py

Evaluation harness for the RAG pipeline.
Runs test cases against rag_interface.ask() and scores results.

Public functions:
    evaluate(test_case)          → dict (single result)
    run_all(test_cases)          → dict (summary + all results)
"""
import time

from dataclasses import dataclass, field

from observability.logger import get_logger

logger = get_logger(__name__)


@dataclass
class TestCase:
    """Single evaluation case for the RAG pipeline."""
    query:            str
    expected_keywords: list[str] = field(default_factory=list)
    expected_sources:  list[str] = field(default_factory=list)


def evaluate(test_case: TestCase) -> dict:
    """
    Run a single TestCase through the RAG pipeline and score it.

    Returns:
        {query, answer, keyword_score, source_match, has_answer, passed, error}
    """
    from rag.rag_interface import ask

    result = ask(test_case.query)
    answer = result.get("answer", "")
    error  = result.get("error")
    sources = result.get("sources", [])

    has_answer = bool(answer and not error)

    # Keyword score: fraction of expected keywords found in answer (case-insensitive)
    if test_case.expected_keywords:
        answer_lower = answer.lower()
        matched = sum(
            1 for kw in test_case.expected_keywords
            if kw.lower() in answer_lower
        )
        keyword_score = matched / len(test_case.expected_keywords)
    else:
        keyword_score = 1.0  # no keywords specified → full score by default

    # Source match: at least one expected source appears in returned sources
    if test_case.expected_sources:
        source_match = any(
            expected in " ".join(sources)
            for expected in test_case.expected_sources
        )
    else:
        source_match = True  # no sources specified → pass by default

    passed = keyword_score >= 0.5 and has_answer

    logger.info(
        f"[eval] query={test_case.query[:60]!r} "
        f"keyword_score={keyword_score:.2f} passed={passed}"
    )
    return {
        "query":         test_case.query,
        "answer":        answer[:300] if answer else "",
        "keyword_score": round(keyword_score, 3),
        "source_match":  source_match,
        "has_answer":    has_answer,
        "passed":        passed,
        "error":         error,
    }


def run_all(test_cases: list[TestCase]) -> dict:
    """
    Run all test cases and print a summary table to stdout.

    Returns:
        {results, total, passed, pass_rate}
    """
    results = []
    for tc in test_cases:
        results.append(evaluate(tc))
        time.sleep(5)
    total   = len(results)
    passed  = sum(1 for r in results if r["passed"])

    # ── Summary table ─────────────────────────────────────────────────────────
    print("\n" + "=" * 72)
    print(f"  EVAL SUMMARY — {passed}/{total} passed  ({100*passed/total:.0f}%)")
    print("=" * 72)
    print(f"  {'#':<3}  {'PASS':<5}  {'KW':>5}  {'SRC':<5}  QUERY")
    print("-" * 72)
    for i, r in enumerate(results, 1):
        status   = "✓" if r["passed"] else "✗"
        src_flag = "✓" if r["source_match"] else "✗"
        query_preview = r["query"][:45]
        print(f"  {i:<3}  {status:<5}  {r['keyword_score']:>5.2f}  {src_flag:<5}  {query_preview}")
    print("=" * 72 + "\n")

    return {
        "results":   results,
        "total":     total,
        "passed":    passed,
        "pass_rate": round(passed / total, 3) if total else 0.0,
    }