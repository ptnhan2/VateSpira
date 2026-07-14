"""Pytest configuration root — ensures backend/ is in sys.path.

Pytest auto-adds the directory containing conftest.py to sys.path,
making sibling modules (codex_service, agent) importable from tests.

Also sets a dummy DEEPSEEK_API_KEY so that `import agent` (which calls
`create_deep_agent(model="deepseek:deepseek-chat")`) can init
the ChatDeepSeek model without a real key. Tests mock all
model calls — the dummy key is never used for actual API requests.
"""

import os

os.environ.setdefault("DEEPSEEK_API_KEY", "test-dummy-not-real")
