"""Pytest configuration root — ensures backend/ is in sys.path.

Pytest auto-adds the directory containing conftest.py to sys.path,
making sibling modules (codex_service, agent) importable from tests.
"""
