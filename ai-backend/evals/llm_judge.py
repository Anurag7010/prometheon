"""
evals/llm_judge.py

LLM-as-judge scoring using GPT-4o to evaluate answer quality on three dimensions:
faithfulness, relevance, and completeness.
"""

import asyncio
from dataclasses import dataclass
from typing import Optional

from core.output_validator import validate_json_output
from observability.logger import log_pipeline_event

JUDGE_SYSTEM_PROMPT = """You are an expert evaluator for AI-powered question answering systems.
Your job is to score an AI answer on three dimensions.
Be strict but fair. Base scores only on what is explicitly in the answer.

IMPORTANT: Output ONLY valid JSON. No explanation, no markdown, no preamble.

Score each dimension from 0.0 to 1.0:
- 0.0: completely fails the criterion
- 0.5: partially meets the criterion
- 1.0: fully meets the criterion

JSON format:
{
  "faithfulness": <float 0.0-1.0>,
  "faithfulness_reason": "<one sentence>",
  "relevance": <float 0.0-1.0>,
  "relevance_reason": "<one sentence>",
  "completeness": <float 0.0-1.0>,
  "completeness_reason": "<one sentence>",
  "composite": <average of the three scores>
}"""

JUDGE_USER_TEMPLATE = """Evaluate this AI answer:

QUESTION: {question}

REFERENCE ANSWER (ground truth):
{ground_truth}

AI ANSWER TO EVALUATE:
{ai_answer}

CONTEXT USED (document chunks retrieved):
{context}

Score the AI answer on:
1. FAITHFULNESS: Does the answer contain claims not supported by the context? (1.0 = no hallucinations, 0.0 = significant hallucination)
2. RELEVANCE: Does the answer actually address what was asked? (1.0 = directly answers, 0.0 = completely off-topic)
3. COMPLETENESS: Does the answer cover the key points in the reference answer? (1.0 = covers all key points, 0.0 = misses most key points)

Output JSON scores:"""

JUDGE_SCHEMA = {
    'type': 'object',
    'required': ['faithfulness', 'relevance', 'completeness', 'composite'],
    'properties': {
        'faithfulness': {'type': 'number'},
        'relevance': {'type': 'number'},
        'completeness': {'type': 'number'},
        'composite': {'type': 'number'},
    },
}


@dataclass
class JudgeScore:
    """Scores from the LLM judge for a single answer."""
    faithfulness: float
    faithfulness_reason: str
    relevance: float
    relevance_reason: str
    completeness: float
    completeness_reason: str
    composite: float
    question_id: str
    raw_output: str


async def judge_answer(
    question: str,
    ground_truth: str,
    ai_answer: str,
    context: str = '',
    question_id: str = '',
    trace_id: Optional[str] = None,
) -> JudgeScore:
    """
    Score an AI answer using GPT-4o as judge.

    Uses asyncio.to_thread since the underlying complete() call is synchronous.
    Returns JudgeScore with per-dimension scores and reasons.
    """
    from core.llm_client import complete

    user_prompt = JUDGE_USER_TEMPLATE.format(
        question=question,
        ground_truth=ground_truth,
        ai_answer=ai_answer,
        context=context[:2000] if context else 'No context available',
    )

    result = await asyncio.to_thread(
        complete,
        user_prompt,
        system=JUDGE_SYSTEM_PROMPT,
        model='gpt-4o',
        temperature=0.0,
        max_tokens=500,
        trace_id=trace_id,
    )

    raw_output = result.get('text', '{}')
    validation = validate_json_output(raw_output, schema=JUDGE_SCHEMA)

    if not validation.valid:
        log_pipeline_event(
            event='judge_parse_failed',
            trace_id=trace_id or '',
            metadata={
                'question_id': question_id,
                'error': validation.error,
            },
        )
        return JudgeScore(
            faithfulness=0.0,
            faithfulness_reason='Judge output unparseable',
            relevance=0.0,
            relevance_reason='Judge output unparseable',
            completeness=0.0,
            completeness_reason='Judge output unparseable',
            composite=0.0,
            question_id=question_id,
            raw_output=raw_output,
        )

    data = validation.data
    return JudgeScore(
        faithfulness=round(float(data.get('faithfulness', 0.0)), 3),
        faithfulness_reason=data.get('faithfulness_reason', ''),
        relevance=round(float(data.get('relevance', 0.0)), 3),
        relevance_reason=data.get('relevance_reason', ''),
        completeness=round(float(data.get('completeness', 0.0)), 3),
        completeness_reason=data.get('completeness_reason', ''),
        composite=round(float(data.get('composite', 0.0)), 3),
        question_id=question_id,
        raw_output=raw_output,
    )
