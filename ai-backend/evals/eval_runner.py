"""
evals/eval_runner.py

Evaluation harness for the RAG pipeline.
Runs test cases against rag_interface.ask() and scores results.

Public functions:
    evaluate(test_case)          → dict (single result)
    run_all(test_cases)          → dict (summary + all results)
    run_llm_judge_eval(...)      → dict (LLM-as-judge report with regression detection)
    run_eval_cli()               → None (CLI entry point, exits 1 on failure)
"""
import asyncio
import json
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from observability.logger import get_logger

logger = get_logger(__name__)

PASSING_THRESHOLD = 0.7
REGRESSION_THRESHOLD = 0.05
EVAL_RESULTS_DIR = Path("evals/results")


@dataclass
class TestCase:
    """Single evaluation case for the RAG pipeline."""
    query:            str
    expected_keywords: list[str] = field(default_factory=list)
    expected_sources:  list[str] = field(default_factory=list)


async def evaluate(test_case: TestCase) -> dict:
    """
    Run a single TestCase through the RAG pipeline and score it.

    Returns:
        {query, answer, keyword_score, source_match, has_answer, passed, error,
         retrieval_quality, guardrail_rejected, no_results, prompt_version}
    """
    from rag.rag_interface import ask

    result = await ask(test_case.query)
    answer = result.get("answer", "")
    error  = result.get("error")
    sources = result.get("sources", [])

    retrieval_quality  = result.get("retrieval_quality", {})
    guardrail_rejected = result.get("guardrail_rejected", False)
    no_results         = result.get("no_results", False)
    prompt_version     = result.get("prompt_version", "unknown")

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
        "query":              test_case.query,
        "answer":             answer[:300] if answer else "",
        "keyword_score":      round(keyword_score, 3),
        "source_match":       source_match,
        "has_answer":         has_answer,
        "passed":             passed,
        "error":              error,
        "retrieval_quality":  retrieval_quality,
        "guardrail_rejected": guardrail_rejected,
        "no_results":         no_results,
        "prompt_version":     prompt_version,
    }


async def run_all(test_cases: list[TestCase]) -> dict:
    """
    Run all test cases and print a summary table to stdout.

    Returns:
        {results, total, passed, pass_rate, avg_retrieval_quality,
         guardrail_rejection_rate, no_result_rate, prompt_versions}
    """
    results = []
    for tc in test_cases:
        results.append(await evaluate(tc))
        await asyncio.sleep(5)
    total   = len(results)
    passed  = sum(1 for r in results if r["passed"])

    avg_retrieval_quality = round(
        sum(r.get("retrieval_quality", {}).get("max_score", 0.0) for r in results) / total, 3
    ) if total else 0.0
    guardrail_rejection_rate = round(
        sum(1 for r in results if r.get("guardrail_rejected")) / total, 3
    ) if total else 0.0
    no_result_rate = round(
        sum(1 for r in results if r.get("no_results")) / total, 3
    ) if total else 0.0
    prompt_versions = list({r.get("prompt_version", "unknown") for r in results})

    # ── Summary table ─────────────────────────────────────────────────────────
    print("\n" + "=" * 72)
    pct = f"{100*passed/total:.0f}%" if total else "N/A"
    print(f"  EVAL SUMMARY — {passed}/{total} passed  ({pct})")
    print("=" * 72)
    print(f"  {'#':<3}  {'PASS':<5}  {'KW':>5}  {'SRC':<5}  QUERY")
    print("-" * 72)
    for i, r in enumerate(results, 1):
        status   = "✓" if r["passed"] else "✗"
        src_flag = "✓" if r["source_match"] else "✗"
        query_preview = r["query"][:45]
        print(f"  {i:<3}  {status:<5}  {r['keyword_score']:>5.2f}  {src_flag:<5}  {query_preview}")
    print("-" * 72)
    print(f"  Avg retrieval quality : {avg_retrieval_quality:.3f}")
    print(f"  Guardrail rejection   : {guardrail_rejection_rate:.3f}")
    print(f"  No-result rate        : {no_result_rate:.3f}")
    print(f"  Prompt versions       : {', '.join(prompt_versions)}")
    print("=" * 72 + "\n")

    return {
        "results":                  results,
        "total":                    total,
        "passed":                   passed,
        "pass_rate":                round(passed / total, 3) if total else 0.0,
        "avg_retrieval_quality":    avg_retrieval_quality,
        "guardrail_rejection_rate": guardrail_rejection_rate,
        "no_result_rate":           no_result_rate,
        "prompt_versions":          prompt_versions,
    }


# ── LLM-as-judge eval pipeline ────────────────────────────────────────────────

async def run_llm_judge_eval(
    dataset_path: str = "evals/eval_dataset.json",
    trace_id: str = None,
) -> dict:
    """
    Run the full LLM-as-judge evaluation pipeline.

    For each question in the dataset:
    1. Run through our RAG system
    2. Score with GPT-4o judge (faithfulness, relevance, completeness)
    3. Save results to evals/results/eval_YYYY-MM-DD_HH-MM.json
    4. Check for regression vs previous run

    Exits with code 1 if avg composite < PASSING_THRESHOLD (CI-ready).
    """
    from evals.llm_judge import judge_answer
    from rag.rag_interface import ask as rag_ask

    with open(dataset_path) as f:
        dataset = json.load(f)

    questions = dataset['questions']
    print(f"\nRunning LLM-as-judge eval on {len(questions)} questions...")
    print(f"Passing threshold: {PASSING_THRESHOLD}")
    print("-" * 60)

    results = []
    category_scores: dict[str, list[float]] = {}

    for i, q in enumerate(questions, 1):
        question_id = q['id']
        category = q['category']
        print(f"[{i}/{len(questions)}] {question_id}: {q['question'][:50]}...")

        try:
            rag_result = await rag_ask(
                query=q['question'],
                trace_id=f"{trace_id or 'eval'}-{question_id}",
            )

            ai_answer = rag_result.get('answer', '')
            sources = rag_result.get('sources', [])
            context = "\n\n".join(
                f"[Source {j + 1}] {s.get('content', '')}"
                for j, s in enumerate(sources[:3])
            )

            guardrail_rejected = rag_result.get('guardrail_rejected', False)
            no_results = rag_result.get('no_results', False)

            score = await judge_answer(
                question=q['question'],
                ground_truth=q['ground_truth'],
                ai_answer=ai_answer,
                context=context,
                question_id=question_id,
                trace_id=trace_id,
            )

            passed = score.composite >= PASSING_THRESHOLD

            category_scores.setdefault(category, []).append(score.composite)

            result = {
                "id": question_id,
                "category": category,
                "question": q['question'],
                "ground_truth": q['ground_truth'],
                "ai_answer": ai_answer,
                "scores": {
                    "faithfulness": score.faithfulness,
                    "relevance": score.relevance,
                    "completeness": score.completeness,
                    "composite": score.composite,
                },
                "reasons": {
                    "faithfulness": score.faithfulness_reason,
                    "relevance": score.relevance_reason,
                    "completeness": score.completeness_reason,
                },
                "passed": passed,
                "guardrail_rejected": guardrail_rejected,
                "no_results": no_results,
                "expected_behavior": q.get('expected_behavior'),
            }
            results.append(result)

            status = "✓ PASS" if passed else "✗ FAIL"
            print(
                f"  {status} | composite={score.composite:.2f} | "
                f"faith={score.faithfulness:.2f} rel={score.relevance:.2f} "
                f"comp={score.completeness:.2f}"
            )

        except Exception as e:
            print(f"  ✗ ERROR: {e}")
            results.append({
                "id": question_id,
                "category": category,
                "question": q['question'],
                "error": str(e),
                "passed": False,
            })

    scored_results = [r for r in results if 'scores' in r]
    all_composites = [r['scores']['composite'] for r in scored_results]
    passed_count = sum(1 for r in results if r.get('passed'))

    summary = {
        "run_date": datetime.utcnow().isoformat(),
        "dataset_version": dataset['version'],
        "total_questions": len(questions),
        "passed": passed_count,
        "failed": len(questions) - passed_count,
        "pass_rate": round(passed_count / len(questions), 3),
        "avg_composite": round(sum(all_composites) / len(all_composites), 3) if all_composites else 0.0,
        "avg_faithfulness": round(sum(r['scores']['faithfulness'] for r in scored_results) / len(scored_results), 3) if scored_results else 0.0,
        "avg_relevance": round(sum(r['scores']['relevance'] for r in scored_results) / len(scored_results), 3) if scored_results else 0.0,
        "avg_completeness": round(sum(r['scores']['completeness'] for r in scored_results) / len(scored_results), 3) if scored_results else 0.0,
        "category_scores": {
            cat: round(sum(scores) / len(scores), 3)
            for cat, scores in category_scores.items()
        },
        "passing_threshold": PASSING_THRESHOLD,
        "overall_passed": (
            (sum(all_composites) / len(all_composites)) >= PASSING_THRESHOLD
            if all_composites else False
        ),
    }

    report = {"summary": summary, "results": results}

    EVAL_RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    result_file = EVAL_RESULTS_DIR / f"eval_{datetime.utcnow().strftime('%Y-%m-%d_%H-%M')}.json"
    with open(result_file, 'w') as f:
        json.dump(report, f, indent=2)

    _check_regression(summary, result_file)

    print("\n" + "=" * 60)
    print("EVAL SUMMARY")
    print("=" * 60)
    print(f"Pass rate:        {summary['pass_rate']:.1%} ({passed_count}/{len(questions)})")
    print(f"Avg composite:    {summary['avg_composite']:.3f}")
    print(f"Avg faithfulness: {summary['avg_faithfulness']:.3f}")
    print(f"Avg relevance:    {summary['avg_relevance']:.3f}")
    print(f"Avg completeness: {summary['avg_completeness']:.3f}")
    print(f"\nCategory breakdown:")
    for cat, score in summary['category_scores'].items():
        print(f"  {cat}: {score:.3f}")
    print(f"\nResults saved to: {result_file}")
    print(f"Overall: {'✓ PASSED' if summary['overall_passed'] else '✗ FAILED'}")

    return report


def _check_regression(current_summary: dict, current_file: Path) -> None:
    """Compare current eval scores against the previous run and warn on regression."""
    result_files = sorted(EVAL_RESULTS_DIR.glob("eval_*.json"))
    if len(result_files) < 2:
        return

    previous_file = result_files[-2]
    try:
        with open(previous_file) as f:
            previous_report = json.load(f)
        previous_composite = previous_report['summary']['avg_composite']
        current_composite = current_summary['avg_composite']
        drop = previous_composite - current_composite
        if drop > REGRESSION_THRESHOLD:
            print(
                f"\n⚠ REGRESSION DETECTED: composite dropped {drop:.3f} "
                f"({previous_composite:.3f} → {current_composite:.3f})"
            )
            print(f"  Previous run: {previous_file.name}")
            print(f"  Investigate before deploying.")
    except Exception:
        pass


async def run_eval_cli() -> None:
    """CLI entry point for running LLM-as-judge evals. Exits 1 on failure."""
    report = await run_llm_judge_eval()
    if not report['summary']['overall_passed']:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(run_eval_cli())