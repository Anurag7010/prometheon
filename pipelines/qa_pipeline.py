"""
pipelines/qa_pipeline.py

Orchestrates the full question-answering flow:
  query → retrieval → context building → prompt → LLM → structured output

Day 1: Stub only. Full pipeline in Day 4–5.
"""


def answer_question(query: str) -> dict:
    """
    End-to-end QA over the RAG system.
    Returns a structured dict: { answer, sources, latency_ms }
    TODO (Day 4): wire rag_interface + llm_client + prompt_engine.
    """
    raise NotImplementedError("qa_pipeline.answer_question is not yet implemented.")