"""
core/config.py

Loads and validates all environment variables.
Exposes a single typed Config object — import the `config` singleton everywhere.
Fails loudly on missing required vars. All tuning defaults live here.
"""

import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


def _require(key: str) -> str:
    """Fetch a required env var. Raise EnvironmentError clearly if missing."""
    value = os.getenv(key)
    if not value:
        raise EnvironmentError(
            f"[Config] Missing required environment variable: '{key}'\n"
            f"  → Add it to your .env file. See .env.example for reference."
        )
    return value


def _optional(key: str, default: str) -> str:
    """Fetch an optional env var, returning default if absent."""
    return os.getenv(key, default)


@dataclass(frozen=True) #immutable after creation
class Config:
    # ── Required ──────────────────────────────────────────────────────────────
    OPENAI_API_KEY: str

    # ── LLM settings ─────────────────────────────────────────────────────────
    MODEL_NAME:   str
    TEMPERATURE:  float
    MAX_TOKENS:   int

    # ── RAG / retrieval settings ──────────────────────────────────────────────
    DEFAULT_TOP_K:               int    # number of chunks to retrieve
    DEFAULT_CHUNK_SIZE:          int    # characters per chunk (ingestion)
    DEFAULT_RETRIEVAL_STRATEGY:  str    # "semantic" | "hybrid" | "multi_query" | "rrf"

    # ── Observability ─────────────────────────────────────────────────────────
    LOG_LEVEL: str

    @classmethod
    def load(cls) -> "Config":
        """Load config from environment. Raises EnvironmentError if OPENAI_API_KEY is missing."""
        return cls(
            OPENAI_API_KEY              = _require("OPENAI_API_KEY"),
            MODEL_NAME                  = _optional("MODEL_NAME",                  "gpt-4o-mini"),
            TEMPERATURE                 = float(_optional("TEMPERATURE",            "0.0")),
            MAX_TOKENS                  = int(_optional("MAX_TOKENS",               "1024")),
            DEFAULT_TOP_K               = int(_optional("DEFAULT_TOP_K",            "5")),
            DEFAULT_CHUNK_SIZE          = int(_optional("DEFAULT_CHUNK_SIZE",       "500")),
            DEFAULT_RETRIEVAL_STRATEGY  = _optional("DEFAULT_RETRIEVAL_STRATEGY",  "semantic"),
            LOG_LEVEL                   = _optional("LOG_LEVEL",                   "INFO"),
        )


# Singleton — import this everywhere
config = Config.load()