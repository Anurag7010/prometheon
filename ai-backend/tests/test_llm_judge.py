"""Tests for evals/llm_judge.py."""

import asyncio
from unittest.mock import patch, MagicMock

import pytest

from evals.llm_judge import judge_answer, JudgeScore


def _mock_complete(text: str):
    """Return a mock complete() function that produces the given text."""
    def _complete(*args, **kwargs):
        return {"text": text, "tokens_used": 100, "error": None}
    return _complete


VALID_JUDGE_RESPONSE = """{
  "faithfulness": 0.9,
  "faithfulness_reason": "Answer is grounded in context.",
  "relevance": 0.8,
  "relevance_reason": "Answer addresses the question.",
  "completeness": 0.7,
  "completeness_reason": "Covers most key points.",
  "composite": 0.8
}"""

INVALID_JUDGE_RESPONSE = "Sorry, I cannot evaluate this."


@pytest.mark.asyncio
async def test_judge_answer_returns_judge_score_with_all_fields():
    with patch("evals.llm_judge.asyncio.to_thread", return_value={"text": VALID_JUDGE_RESPONSE}):
        score = await judge_answer(
            question="What is X?",
            ground_truth="X is Y.",
            ai_answer="X is Y based on the document.",
            question_id="test_001",
        )
    assert isinstance(score, JudgeScore)
    assert score.faithfulness == 0.9
    assert score.relevance == 0.8
    assert score.completeness == 0.7
    assert score.composite == 0.8


@pytest.mark.asyncio
async def test_composite_is_reported_from_judge_output():
    with patch("evals.llm_judge.asyncio.to_thread", return_value={"text": VALID_JUDGE_RESPONSE}):
        score = await judge_answer(
            question="Q?",
            ground_truth="A.",
            ai_answer="A based on docs.",
        )
    assert score.composite == 0.8


@pytest.mark.asyncio
async def test_handles_invalid_json_gracefully():
    with patch("evals.llm_judge.asyncio.to_thread", return_value={"text": INVALID_JUDGE_RESPONSE}):
        score = await judge_answer(
            question="Q?",
            ground_truth="A.",
            ai_answer="Some answer.",
            question_id="edge_001",
        )
    assert score.faithfulness == 0.0
    assert score.relevance == 0.0
    assert score.completeness == 0.0
    assert score.composite == 0.0
    assert score.faithfulness_reason == "Judge output unparseable"


@pytest.mark.asyncio
async def test_uses_temperature_zero_for_determinism():
    captured = {}

    async def fake_to_thread(fn, *args, **kwargs):
        captured["temperature"] = kwargs.get("temperature")
        return {"text": VALID_JUDGE_RESPONSE}

    with patch("evals.llm_judge.asyncio.to_thread", side_effect=fake_to_thread):
        await judge_answer("Q?", "A.", "answer")

    assert captured.get("temperature") == 0.0


@pytest.mark.asyncio
async def test_uses_gpt4o_model_not_mini():
    captured = {}

    async def fake_to_thread(fn, *args, **kwargs):
        captured["model"] = kwargs.get("model")
        return {"text": VALID_JUDGE_RESPONSE}

    with patch("evals.llm_judge.asyncio.to_thread", side_effect=fake_to_thread):
        await judge_answer("Q?", "A.", "answer")

    assert captured.get("model") == "gpt-4o"


@pytest.mark.asyncio
async def test_reason_fields_are_strings():
    with patch("evals.llm_judge.asyncio.to_thread", return_value={"text": VALID_JUDGE_RESPONSE}):
        score = await judge_answer("Q?", "A.", "answer.", question_id="q1")
    assert isinstance(score.faithfulness_reason, str)
    assert isinstance(score.relevance_reason, str)
    assert isinstance(score.completeness_reason, str)
