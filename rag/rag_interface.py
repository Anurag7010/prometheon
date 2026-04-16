"""
rag/rag_interface.py

Clean interface to the external RAG system (external/rag_system/).
This module wraps your existing LangChain RAG codebase.
Do NOT rebuild RAG here — integrate it.

Day 1: Stub only. Full integration in Day 4.
"""


def retrieve(query: str) -> list[str]:
    """
    Run retrieval against the vector store.
    Returns a list of relevant document chunks.
    TODO (Day 4): wire to external/rag_system/retrieval_pipeline.py
    """
    raise NotImplementedError("rag_interface.retrieve is not yet implemented.")


def generate_answer(query: str, context: list[str]) -> str:
    """
    Generate a grounded answer from retrieved context.
    TODO (Day 4): wire to external/rag_system/answer_generation.py
    """
    raise NotImplementedError("rag_interface.generate_answer is not yet implemented.")