"""Tests for tiered embedding selection."""
import os
import pytest

os.environ.setdefault("OWNER_EMAIL", "rautanurag9@gmail.com")
os.environ.setdefault("OPENAI_API_KEY", "test-key")


def test_owner_tier_has_openai_embeddings():
    from core.user_tier import get_tier_config
    cfg = get_tier_config("rautanurag9@gmail.com")
    assert cfg.embedding_provider == "openai"
    assert cfg.embedding_model == "text-embedding-3-small"


def test_free_tier_has_huggingface_embeddings():
    from core.user_tier import get_tier_config
    cfg = get_tier_config("someone@example.com")
    assert cfg.embedding_provider == "huggingface"
    assert cfg.embedding_model == "all-MiniLM-L6-v2"


def test_huggingface_embedder_returns_floats():
    """HuggingFace embedder runs locally — no API key needed."""
    from langchain_community.embeddings import HuggingFaceEmbeddings
    embedder = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    result = embedder.embed_documents(["hello world"])
    assert isinstance(result, list)
    assert len(result) == 1
    assert isinstance(result[0], list)
    assert all(isinstance(v, float) for v in result[0])


def test_huggingface_embedding_dimension_is_384():
    from langchain_community.embeddings import HuggingFaceEmbeddings
    embedder = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    result = embedder.embed_documents(["test sentence"])
    assert len(result[0]) == 384
