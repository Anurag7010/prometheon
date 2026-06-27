"""Tests for agents/tools/web_search.py — WebSearchTool."""
from dataclasses import replace
from unittest.mock import MagicMock, patch

import pytest
from pydantic import ValidationError

from agents.tools.web_search import WebSearchTool
from core.config import config


def _config_with_key(key: str):
    """config is a frozen dataclass — build a copy with a different TAVILY_API_KEY."""
    return replace(config, TAVILY_API_KEY=key)


def test_tool_name():
    tool = WebSearchTool()
    assert tool.name == "web_search"


def test_tool_description_mentions_internet_and_current():
    tool = WebSearchTool()
    assert "internet" in tool.description.lower()
    assert "current information" in tool.description.lower()


def test_input_schema_validates_max_results_range():
    with pytest.raises(ValidationError):
        WebSearchTool.InputSchema(query="x", max_results=10)
    with pytest.raises(ValidationError):
        WebSearchTool.InputSchema(query="x", max_results=0)
    # valid value should pass
    valid = WebSearchTool.InputSchema(query="x", max_results=3)
    assert valid.max_results == 3


async def test_fallback_when_api_key_empty():
    tool = WebSearchTool()
    with patch("agents.tools.web_search.config", _config_with_key("")), \
         patch.dict("os.environ", {"TAVILY_API_KEY": ""}):
        result = await tool.execute({"query": "anything"})
    assert result.success is True
    assert result.output[0]["title"] == "Web search not configured"


async def test_returns_result_dicts_when_tavily_returns_results():
    tool = WebSearchTool()
    fake_response = {
        "results": [
            {"title": "T1", "url": "http://a", "content": "c1", "score": 0.91},
            {"title": "T2", "url": "http://b", "content": "c2", "score": 0.82},
        ]
    }
    with patch("agents.tools.web_search.config", _config_with_key("fake-key")):
        with patch("tavily.TavilyClient") as mock_client_class:
            mock_client = MagicMock()
            mock_client.search.return_value = fake_response
            mock_client_class.return_value = mock_client
            result = await tool.execute({"query": "test"})

    assert result.success is True
    assert len(result.output) == 2
    for item in result.output:
        assert "title" in item
        assert "url" in item
        assert "content" in item
        assert "score" in item


async def test_respects_max_results_param():
    tool = WebSearchTool()
    with patch("agents.tools.web_search.config", _config_with_key("fake-key")):
        with patch("tavily.TavilyClient") as mock_client_class:
            mock_client = MagicMock()
            mock_client.search.return_value = {"results": []}
            mock_client_class.return_value = mock_client
            await tool.execute({"query": "test", "max_results": 5})

    mock_client.search.assert_called_once()
    assert mock_client.search.call_args.kwargs["max_results"] == 5


async def test_handles_tavily_exception_gracefully():
    tool = WebSearchTool()
    with patch("agents.tools.web_search.config", _config_with_key("fake-key")):
        with patch("tavily.TavilyClient") as mock_client_class:
            mock_client = MagicMock()
            mock_client.search.side_effect = RuntimeError("API down")
            mock_client_class.return_value = mock_client
            result = await tool.execute({"query": "test"})

    assert result.success is False
    assert result.error is not None
