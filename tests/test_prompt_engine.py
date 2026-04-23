"""
tests/test_prompt_engine.py

Unit tests for core/prompt_engine.py.
No LLM calls — purely tests template rendering logic.

Run: python -m pytest tests/test_prompt_engine.py -v
"""

import pytest
from core.prompt_engine import render, list_templates


class TestRender:

    def test_qa_contains_question_and_context(self):
        """QA template renders with both question and context present in output."""
        result = render("qa", question="What is RAG?", context="RAG is retrieval-augmented generation.")
        assert "What is RAG?" in result
        assert "RAG is retrieval-augmented generation." in result
        assert len(result) > 0

    def test_summarization_contains_document(self):
        """Summarization template renders with document text present."""
        result = render("summarization", document="This document is about AI.")
        assert "This document is about AI." in result

    def test_extraction_list_fields_serialized(self):
        """Extraction template converts fields list to comma-separated string."""
        result = render("extraction", document="John is 30.", fields=["name", "age"])
        assert "name, age" in result
        assert "John is 30." in result

    def test_extraction_string_fields_accepted(self):
        """Extraction template also accepts fields already as a string."""
        result = render("extraction", document="John is 30.", fields="name, age")
        assert "name, age" in result

    def test_rag_template_renders(self):
        """RAG template renders with question and context."""
        result = render("rag", question="What year?", context="The year was 2024.")
        assert "What year?" in result
        assert "The year was 2024." in result

    def test_unknown_template_raises_value_error(self):
        """Unknown template name raises ValueError with available names."""
        with pytest.raises(ValueError, match="Unknown template"):
            render("nonexistent_template", foo="bar")

    def test_missing_variable_raises_value_error(self):
        """Missing required variable raises ValueError with clear message."""
        with pytest.raises(ValueError, match="Missing"):
            render("qa", question="only question provided")

    def test_returns_string(self):
        """render() always returns a plain str."""
        result = render("summarization", document="test")
        assert isinstance(result, str)


class TestListTemplates:

    def test_returns_list(self):
        """list_templates() returns a list."""
        assert isinstance(list_templates(), list)

    def test_contains_expected_names(self):
        """All four expected templates are registered."""
        names = list_templates()
        for expected in ["qa", "summarization", "extraction", "rag"]:
            assert expected in names