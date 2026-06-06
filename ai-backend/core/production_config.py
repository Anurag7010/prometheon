"""
core/production_config.py

Environment-specific configuration classes.

Defaults to DevelopmentConfig — production must be set explicitly via ENVIRONMENT=production.
"""

import os
from dataclasses import dataclass, field


@dataclass
class BaseConfig:
    """Settings common to all environments."""
    MODEL_NAME: str = 'gpt-4o'
    FAST_MODEL: str = 'gpt-4o-mini'
    TEMPERATURE: float = 0.0
    MAX_TOKENS: int = 2000
    DEFAULT_TOP_K: int = 5
    DEFAULT_CHUNK_SIZE: int = 500
    DEFAULT_RETRIEVAL_STRATEGY: str = 'semantic'
    RELEVANCE_THRESHOLD: float = 0.65
    MAX_QUERY_CHARS: int = 2000
    RATE_LIMIT_REQUESTS: int = 20
    RATE_LIMIT_WINDOW: int = 60
    DAILY_TOKEN_BUDGET: int = 100_000
    REQUEST_QUEUE_CONCURRENCY: int = 10
    REQUEST_QUEUE_TIMEOUT: float = 30.0


@dataclass
class DevelopmentConfig(BaseConfig):
    """Development overrides — verbose logging, relaxed limits."""
    LOG_LEVEL: str = 'DEBUG'
    UVICORN_RELOAD: bool = True
    CORS_ORIGINS: list = field(default_factory=list)
    RATE_LIMIT_REQUESTS: int = 100

    def __post_init__(self) -> None:
        self.CORS_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000']


@dataclass
class ProductionConfig(BaseConfig):
    """Production settings — strict limits, minimal logging."""
    LOG_LEVEL: str = 'WARNING'
    UVICORN_RELOAD: bool = False
    CORS_ORIGINS: list = field(default_factory=list)

    def __post_init__(self) -> None:
        frontend_url = os.getenv('FRONTEND_URL')
        if not frontend_url:
            raise ValueError('FRONTEND_URL must be set in production')
        self.CORS_ORIGINS = [frontend_url]


def get_config() -> BaseConfig:
    """Return the correct config based on ENVIRONMENT env var. Defaults to development."""
    env = os.getenv('ENVIRONMENT', 'development').lower()
    if env == 'production':
        return ProductionConfig()
    return DevelopmentConfig()
