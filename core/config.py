"""
core/config.py

Loads and validates all environment variables.
Exposes a single typed Config object.
Fails loudly if required variables are missing.
"""

import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


def _require(key: str) -> str:
    """Fetch a required env var. Raise clearly if missing."""
    value = os.getenv(key)
    if not value:
        raise EnvironmentError(
            f"[Config] Missing required environment variable: '{key}'\n"
            )
    return value


def _optional(key: str, default: str) -> str:
    """Fetch an optional env var with a fallback default."""
    return os.getenv(key, default)


@dataclass(frozen=True)
class Config:
    # Required
    OPENAI_API_KEY: str

    # Optional with sensible defaults
    MODEL_NAME: str
    TEMPERATURE: float
    MAX_TOKENS: int
    LOG_LEVEL: str

    @classmethod
    def load(cls) -> "Config":
        return cls(
            OPENAI_API_KEY=_require("OPENAI_API_KEY"),
            MODEL_NAME=_optional("MODEL_NAME", "gpt-4o-mini"),
            TEMPERATURE=float(_optional("TEMPERATURE", "0.0")),
            MAX_TOKENS=int(_optional("MAX_TOKENS", "1024")),
            LOG_LEVEL=_optional("LOG_LEVEL", "INFO"),
        )


config = Config.load()