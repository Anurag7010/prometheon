from pydantic import BaseModel, Field

from agents.tools.base import BaseTool
from core.config import config


class WebSearchTool(BaseTool):
    name = "web_search"
    description = (
        "Search the internet for current information not available in the uploaded documents. "
        "Use this when the user asks about recent events, current facts, or topics not covered "
        "by their documents. Returns web page excerpts with titles and URLs."
    )

    class InputSchema(BaseModel):
        query: str = Field(description="The search query to look up on the web")
        max_results: int = Field(
            default=3,
            ge=1,
            le=5,
            description="Maximum number of results to return",
        )

    async def _execute(self, input: InputSchema) -> list[dict]:
        """
        Search the web using Tavily API.
        Falls back gracefully if TAVILY_API_KEY is not configured.
        """
        import os
        # Read at call time so a server restart after adding the key works immediately.
        # config.TAVILY_API_KEY is frozen at startup and won't reflect .env edits.
        api_key = os.getenv("TAVILY_API_KEY") or config.TAVILY_API_KEY
        if not api_key:
            return [
                {
                    "title": "Web search not configured",
                    "url": "",
                    "content": "Tavily API key not set. Add TAVILY_API_KEY to .env to enable web search.",
                    "score": 0.0,
                }
            ]

        from tavily import TavilyClient

        client = TavilyClient(api_key=api_key)
        response = client.search(
            query=input.query,
            max_results=input.max_results,
            search_depth="basic",
            include_answer=False,
            include_raw_content=False,
        )

        return [
            {
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "content": r.get("content", ""),
                "score": round(r.get("score", 0.0), 3),
            }
            for r in response.get("results", [])
        ]
