"""
evals/eval_runner.py

Runs evaluation queries against the system and scores outputs.
Reads test cases from evals/test_cases.json.

Day 1: Stub only. Full evaluator in Day 6.
"""


def run_evals(test_cases_path: str = "evals/test_cases.json") -> dict:
    """
    Load test cases and run each through the QA pipeline.
    Returns a summary dict: { total, passed, failed, results[] }
    TODO (Day 6): implement scoring (exact match, semantic similarity).
    """
    raise NotImplementedError("eval_runner.run_evals is not yet implemented.")