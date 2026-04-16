"""
main.py

System entry point.
Loads configuration and confirms the backend is ready to run.
"""

from core.config import config
from observability.logger import get_logger

logger = get_logger(__name__)


def main() -> None:
    logger.info("AI Backend starting up...")
    logger.info(f"  Model      : {config.MODEL_NAME}")
    logger.info(f"  Temperature: {config.TEMPERATURE}")
    logger.info(f"  Max Tokens : {config.MAX_TOKENS}")
    logger.info(f"  Log Level  : {config.LOG_LEVEL}")
    logger.info("System ready. All modules initialized.")


if __name__ == "__main__":
    main()