"""
core/user_tier.py

Determines which LLM and embedding provider a user gets based on their email.
Owner email is set via OWNER_EMAIL env var — never hardcoded beyond the default.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from core.config import config


class UserTier(str, Enum):
    OWNER = "owner"
    FREE = "free"


@dataclass(frozen=True)
class TierConfig:
    """Full provider configuration for a user's tier."""

    tier: UserTier
    llm_provider: str  # "openai" | "groq"
    llm_model: str
    fast_model: str  # cheaper model for extraction/judge
    embedding_provider: str  # "openai" | "huggingface"
    embedding_model: str
    max_tokens: int
    temperature: float
    # Retrieval-quality thresholds, calibrated to the embedding model's cosine
    # score distribution: MiniLM scores run ~0.15-0.25 lower than OpenAI's for
    # equally relevant matches, so a shared scale would mislabel free-tier
    # retrievals as low confidence.
    quality_good_threshold: float = 0.8
    quality_fair_threshold: float = 0.65

    @property
    def is_owner(self) -> bool:
        """True when this user has owner-tier access."""
        return self.tier == UserTier.OWNER


_OWNER_CONFIG = TierConfig(
    tier=UserTier.OWNER,
    llm_provider="openai",
    llm_model="gpt-4o",
    fast_model="gpt-4o-mini",
    embedding_provider="openai",
    embedding_model="text-embedding-3-small",
    max_tokens=2000,
    temperature=0.0,
)

_FREE_CONFIG = TierConfig(
    tier=UserTier.FREE,
    llm_provider="groq",
    llm_model="llama-3.3-70b-versatile",
    fast_model="llama-3.1-8b-instant",
    embedding_provider="huggingface",
    embedding_model="all-MiniLM-L6-v2",
    max_tokens=2000,
    temperature=0.0,
    quality_good_threshold=0.55,
    quality_fair_threshold=0.40,
)


def get_tier_config(email: str | None) -> TierConfig:
    """Return the TierConfig for a user based on their email address."""
    if email and email.strip().lower() == config.OWNER_EMAIL.strip().lower():
        return _OWNER_CONFIG
    return _FREE_CONFIG
