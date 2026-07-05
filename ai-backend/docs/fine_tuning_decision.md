# Fine-Tuning Decision Record

**Date:** 2026-06-06

**Decision:** Do not fine-tune. Use RAG + prompt engineering.

**Status:** Final

## The Question

Should we fine-tune a base LLM to improve our AI product's answer quality?

## Analysis

### What our quality problems actually are

From evaluation (see the eval harness in [`../evals/`](../evals)):

- Primary issue: retrieval returning low-relevance chunks → fixed with score threshold
- Secondary issue: LLM not following output format consistently → fixed with output validation + fallback chain
- Remaining gaps: occasional incomplete answers on complex multi-part questions

None of these are solvable by fine-tuning.

### Why fine-tuning would not help

1. Our quality problems are retrieval problems, not model behavior problems
   - Fine-tuning changes how the model responds, not what it retrieves
   - Retrieval quality is determined by chunking, embedding, and similarity threshold

2. We do not have enough training data
   - Fine-tuning requires 1000+ high-quality (question, ideal answer) pairs
   - We have 20 eval pairs — 50x too few

3. Our requirements are not stable enough
   - Fine-tuning locks in behavior — hard to change without retraining
   - Our prompts can be updated in minutes; retraining takes days

4. Prompting already works
   - The fallback chain + output validation achieves consistent output format
   - The guardrails achieve domain restriction
   - These were the two strongest fine-tuning arguments — both solved without fine-tuning

### When we would revisit this decision

- If we need a specific writing style that prompting cannot achieve (e.g. highly regulated legal language)
- If we process 10,000+ queries/day and want to use a cheaper fine-tuned small model
- If we have a stable, well-defined task with 1000+ training examples

### Alternative improvements (do these instead)

1. Better chunking: semantic chunking already implemented (Day 3)
2. Better retrieval: multi-query + RRF already implemented (Day 10)
3. Better prompts: versioned prompts + output validation (Day 10)
4. Better eval: LLM-as-judge pipeline (this document)

## Conclusion

Fine-tuning is not appropriate for this product at this stage.

RAG + prompt engineering solves our actual problems with lower cost and faster iteration.
