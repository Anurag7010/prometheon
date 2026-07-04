"""
tests/conftest.py

Pin the auth key the API tests expect BEFORE any app import loads config.
Without this, a local .env with a production INTERNAL_API_KEY makes every
authenticated endpoint test fail with 401 (config reads env at import time,
and load_dotenv() does not override variables that are already set).
"""

import os

os.environ["INTERNAL_API_KEY"] = "dev-internal-key-change-in-production"
