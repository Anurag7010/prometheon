"""
evals/test_cases.py

Default test cases for the RAG eval harness.
Queries are intentionally generic so they work against any ingested document.
Add document-specific cases in a separate file as needed.
"""

from evals.eval_runner import TestCase

TEST_CASES: list[TestCase] = [
    TestCase(
        query="What is the main topic of this document?",
        expected_keywords=["document", "about", "discuss", "topic", "cover"],
        expected_sources=[],
    ),
    TestCase(
        query="Summarize the key points from this document.",
        expected_keywords=["key", "point", "main", "include", "summary"],
        expected_sources=[],
    ),
    TestCase(
        query="What conclusions does this document reach?",
        expected_keywords=["conclude", "conclusion", "result", "finding", "show"],
        expected_sources=[],
    ),
    TestCase(
        query="What problem does this document address?",
        expected_keywords=["problem", "issue", "challenge", "address", "solve"],
        expected_sources=[],
    ),
    TestCase(
        query="What are the main sections or chapters of this document?",
        expected_keywords=["section", "chapter", "part", "include", "cover"],
        expected_sources=[],
    ),
]