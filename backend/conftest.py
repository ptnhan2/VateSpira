"""Pytest configuration root — ensures backend/ is in sys.path.

Pytest auto-adds the directory containing conftest.py to sys.path,
making sibling modules (codex_service, agent) importable from tests.

Also loads root .env (source of truth) via python-dotenv so that
real credentials are available for E2E tests. Sets a dummy
DEEPSEEK_API_KEY as fallback if not in .env.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# Load root .env (source of truth, 2 levels up from backend/)
_root_env = Path(__file__).parent.parent / ".env"
load_dotenv(_root_env)

os.environ.setdefault("DEEPSEEK_API_KEY", "test-dummy-not-real")
