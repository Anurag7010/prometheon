"""
observability/logger.py

Structured logger for the entire AI backend.
All modules must use get_logger(__name__) — never print() or raw logging calls.
"""

import logging
import sys
from core.config import config


def get_logger(name: str) -> logging.Logger:
    """
    Return a named logger configured with the system log level.
    Outputs structured lines to stdout.
    """
    logger = logging.getLogger(name)

    if logger.handlers:
        # Already configured — return as-is (avoid duplicate handlers)
        return logger

    level = getattr(logging, config.LOG_LEVEL.upper(), logging.INFO)
    logger.setLevel(level)

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)

    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.propagate = False

    return logger