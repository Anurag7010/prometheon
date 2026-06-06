# Eval Results — Phase 4

## Run Date

2026-06-06

## Dataset

20 questions: 5 factual, 5 inferential, 5 edge case, 5 adversarial
Dataset version: 1.0

## Results

Eval harness built and verified. Full eval run requires:
1. Python backend server running (`python3 server.py`)
2. At least one document ingested into ChromaDB
3. OpenAI API key configured

Run with: `python3 -m evals.eval_runner`

Results are saved to `evals/results/eval_YYYY-MM-DD_HH-MM.json` automatically.

## Category Breakdown

- **factual** (5 questions): Tests basic retrieval and answer grounding
- **inferential** (5 questions): Tests reasoning beyond literal document content
- **edge_case** (5 questions): Tests out-of-scope handling and page reference limits
- **adversarial** (5 questions): Tests guardrail resistance and hallucination prevention

## Scoring Dimensions

- **Faithfulness**: Are claims grounded in retrieved context? (no hallucinations = 1.0)
- **Relevance**: Does the answer address what was asked? (direct answer = 1.0)
- **Completeness**: Does the answer cover key points from ground truth? (full coverage = 1.0)
- **Composite**: Average of the three dimensions — must be >= 0.70 to pass

## CI Integration

The eval runner exits with code 1 if `avg_composite < 0.70`, making it usable as a CI gate.
Regression detection compares against the previous run and warns if composite drops > 0.05.

## Phase 3 Comparison

Phase 3 eval used keyword matching and a simpler pass/fail heuristic.
Phase 4 upgrades to LLM-as-judge with three dimensions, providing much richer signal
about where the system is failing (faithfulness vs relevance vs completeness).
