"""
tests/test_rag_interface.py

Unit tests for rag/rag_interface.py.
All LangChain and unstructured dependencies are mocked — no real vector DB calls.

Run: python -m pytest tests/test_rag_interface.py -v
"""

import json
import pytest
from unittest.mock import MagicMock, patch


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _make_lc_doc(content: str = "test content", source: str = "test.pdf", chunk_index: int = 0) -> MagicMock:
    """Create a fake LangChain Document object."""
    doc = MagicMock()
    doc.page_content = content
    doc.metadata = {
        "source": source,
        "chunk_index": chunk_index,
        "score": 0.85,
        "original_content": json.dumps({
            "raw_text": content,
            "tables_html": [],
            "images_base64": [],
        }),
    }
    return doc


def _make_deps(docs: list | None = None) -> dict:
    """Build a minimal mock deps dict that rag_interface expects."""
    docs = docs or [_make_lc_doc()]
    retriever       = MagicMock()
    retriever.invoke.return_value = docs

    vectorstore     = MagicMock()
    vectorstore.as_retriever.return_value = retriever
    vectorstore.max_marginal_relevance_search.return_value = docs

    llm_response    = MagicMock()
    llm_response.content = "The document is about machine learning."
    chat_llm        = MagicMock()
    chat_llm.invoke.return_value = llm_response

    deps = {
        "partition_pdf":    MagicMock(return_value=[]),
        "chunk_by_title":   MagicMock(return_value=[]),
        "Document":         MagicMock,
        "ChatOpenAI":       MagicMock(return_value=chat_llm),
        "OpenAIEmbeddings": MagicMock(return_value=MagicMock()),
        "Chroma":           MagicMock(return_value=vectorstore),
        "HumanMessage":     MagicMock(side_effect=lambda content: content),
        "_vectorstore":     vectorstore,
    }
    return deps


# ── retrieve() ────────────────────────────────────────────────────────────────

class TestRetrieve:

    @patch("rag.rag_interface._get_deps")
    @patch("rag.rag_interface._get_vectorstore")
    def test_returns_list_of_dicts(self, mock_vs, mock_deps):
        """retrieve() always returns a list of dicts."""
        docs = [_make_lc_doc("content A"), _make_lc_doc("content B")]
        deps = _make_deps(docs)
        mock_deps.return_value = deps
        mock_vs.return_value   = deps["_vectorstore"]

        from rag.rag_interface import retrieve
        results = retrieve("test query", top_k=2, strategy="semantic")

        assert isinstance(results, list)
        assert len(results) == 2

    @patch("rag.rag_interface._get_deps")
    @patch("rag.rag_interface._get_vectorstore")
    def test_result_dicts_have_required_keys(self, mock_vs, mock_deps):
        """Each result dict has content, score, and metadata keys."""
        deps = _make_deps()
        mock_deps.return_value = deps
        mock_vs.return_value   = deps["_vectorstore"]

        from rag.rag_interface import retrieve
        results = retrieve("test query")

        assert len(results) > 0
        for r in results:
            assert "content"  in r
            assert "score"    in r
            assert "metadata" in r

    @patch("rag.rag_interface._get_deps")
    @patch("rag.rag_interface._get_vectorstore")
    def test_metadata_has_source_and_chunk_index(self, mock_vs, mock_deps):
        """metadata dict contains source and chunk_index."""
        deps = _make_deps()
        mock_deps.return_value = deps
        mock_vs.return_value   = deps["_vectorstore"]

        from rag.rag_interface import retrieve
        results = retrieve("test query")
        meta = results[0]["metadata"]
        assert "source"      in meta
        assert "chunk_index" in meta

    @patch("rag.rag_interface._get_deps", side_effect=ImportError("unstructured missing"))
    def test_import_error_returns_error_list(self, _):
        """ImportError returns [{error: str}] — not an exception."""
        from rag.rag_interface import retrieve
        results = retrieve("query")
        assert isinstance(results, list)
        assert "error" in results[0]

    @patch("rag.rag_interface._get_deps")
    @patch("rag.rag_interface._get_vectorstore")
    def test_unknown_strategy_returns_error_list(self, mock_vs, mock_deps):
        """Invalid strategy returns [{error: str}] with a descriptive message."""
        deps = _make_deps()
        mock_deps.return_value = deps
        mock_vs.return_value   = deps["_vectorstore"]

        from rag.rag_interface import retrieve
        results = retrieve("query", strategy="nonexistent_strategy")
        assert "error" in results[0]
        assert "Unknown strategy" in results[0]["error"]


# ── ask() ─────────────────────────────────────────────────────────────────────

class TestAsk:

    @patch("rag.rag_interface._get_deps")
    @patch("rag.rag_interface._get_vectorstore")
    def test_returns_required_shape(self, mock_vs, mock_deps):
        """ask() returns dict with all required keys."""
        deps = _make_deps()
        mock_deps.return_value = deps
        mock_vs.return_value   = deps["_vectorstore"]

        from rag.rag_interface import ask
        result = ask("What is machine learning?")

        assert "answer"            in result
        assert "sources"           in result
        assert "latency_breakdown" in result
        assert "trace_id"          in result
        assert "error"             in result

    @patch("rag.rag_interface._get_deps")
    @patch("rag.rag_interface._get_vectorstore")
    def test_latency_breakdown_has_three_keys(self, mock_vs, mock_deps):
        """latency_breakdown always contains retrieval_ms, generation_ms, total_ms."""
        deps = _make_deps()
        mock_deps.return_value = deps
        mock_vs.return_value   = deps["_vectorstore"]

        from rag.rag_interface import ask
        result = ask("test")
        lb = result["latency_breakdown"]
        assert "retrieval_ms"  in lb
        assert "generation_ms" in lb
        assert "total_ms"      in lb

    @patch("rag.rag_interface._get_deps")
    @patch("rag.rag_interface._get_vectorstore")
    def test_trace_id_forwarded_in_response(self, mock_vs, mock_deps):
        """trace_id passed to ask() appears in the returned dict."""
        deps = _make_deps()
        mock_deps.return_value = deps
        mock_vs.return_value   = deps["_vectorstore"]

        from rag.rag_interface import ask
        result = ask("test", trace_id="my-custom-trace")
        assert result["trace_id"] == "my-custom-trace"

    @patch("rag.rag_interface._get_deps", side_effect=ImportError("deps missing"))
    def test_import_error_returns_error_dict(self, _):
        """ImportError returns structured error dict — not an exception."""
        from rag.rag_interface import ask
        result = ask("test")
        assert result["error"] is not None
        assert result["answer"]  == ""
        assert result["sources"] == []


# ── ingest() ─────────────────────────────────────────────────────────────────

class TestIngest:

    @patch("rag.rag_interface._get_deps", side_effect=ImportError("unstructured missing"))
    def test_import_error_returns_error_status(self, _):
        """ImportError during ingest returns {status: error, chunk_count: 0}."""
        from rag.rag_interface import ingest
        result = ingest("fake.pdf")
        assert result["status"]      == "error"
        assert result["chunk_count"] == 0
        assert result["error"] is not None

    def test_ingest_shape_on_error(self):
        """ingest() always returns dict with status, chunk_count, error keys."""
        from rag.rag_interface import ingest
        result = ingest("nonexistent.pdf")
        assert "status"      in result
        assert "chunk_count" in result
        assert "error"       in result