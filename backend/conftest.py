"""Pytest configuration root — ensures backend/ is in sys.path.

Pytest auto-adds the directory containing conftest.py to sys.path,
making sibling modules (codex_service, agent) importable from tests.

Also sets a dummy GOOGLE_API_KEY so that `import agent` (which calls
`create_deep_agent(model="google_genai:gemini-2.5-flash")`) can init
the ChatGoogleGenerativeAI model without a real key. Tests mock all
model calls — the dummy key is never used for actual API requests.
"""

import os

os.environ.setdefault("GOOGLE_API_KEY", "test-dummy-not-real")
