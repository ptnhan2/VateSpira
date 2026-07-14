"""Tests cho codex_service novel CRUD functions.

Mock Supabase client qua patch.object(codex_service, "_get_client")
để test logic CRUD mà không cần kết nối DB thật. Helper _make_supabase_mock
tạo fluent mock cho query builder chaining (.select().eq().order().execute()).
"""

from unittest.mock import MagicMock, patch

import pytest

import codex_service


# --- Fixtures & helpers ---

def _make_supabase_mock(data=None):
    """Tạo mock Supabase client với fluent query builder chaining.

    Builder methods (select/insert/eq/order) return self để mock chaining.
    execute() trả về result object có .data.

    Args:
        data: Giá trị trả về cho result.data (default []).

    Returns:
        Tuple (client_mock, builder_mock).
    """
    client = MagicMock()
    builder = MagicMock()
    builder.select.return_value = builder
    builder.insert.return_value = builder
    builder.eq.return_value = builder
    builder.order.return_value = builder
    result = MagicMock()
    result.data = data if data is not None else []
    builder.execute.return_value = result
    client.table.return_value = builder
    return client, builder


@pytest.fixture(autouse=True)
def _reset_client_singleton():
    """Reset _client singleton trước và sau mỗi test để tránh leak state."""
    codex_service._client = None
    yield
    codex_service._client = None


# --- create_novel ---

def test_create_novel_returns_inserted_record():
    """create_novel trả về record từ insert result."""
    client, _ = _make_supabase_mock(
        data=[{"id": "n1", "user_id": "u1", "title": "Test Novel"}]
    )
    with patch.object(codex_service, "_get_client", return_value=client):
        result = codex_service.create_novel(user_id="u1", title="Test Novel")
    assert result["id"] == "n1"
    assert result["title"] == "Test Novel"


def test_create_novel_sends_correct_payload():
    """create_novel gửi payload đúng user_id, title, language, pov, tense, technique."""
    client, builder = _make_supabase_mock(data=[{"id": "n1"}])
    with patch.object(codex_service, "_get_client", return_value=client):
        codex_service.create_novel(
            user_id="u1", title="T", language="en", pov="first", tense="past"
        )
    client.table.assert_called_with("novels")
    payload = builder.insert.call_args[0][0]
    assert payload["user_id"] == "u1"
    assert payload["title"] == "T"
    assert payload["language"] == "en"
    assert payload["pov"] == "first"
    assert payload["tense"] == "past"
    assert payload["technique"] == "save-the-cat"


def test_create_novel_defaults_save_the_cat():
    """create_novel default technique='save-the-cat', language='vi', pov/tense=None."""
    client, builder = _make_supabase_mock(data=[{"id": "n1"}])
    with patch.object(codex_service, "_get_client", return_value=client):
        codex_service.create_novel(user_id="u1", title="T")
    payload = builder.insert.call_args[0][0]
    assert payload["technique"] == "save-the-cat"
    assert payload["language"] == "vi"
    assert payload["pov"] is None
    assert payload["tense"] is None


# --- list_novels ---

def test_list_novels_filters_by_user_id():
    """list_novels lọc theo user_id qua .eq("user_id", ...)."""
    client, builder = _make_supabase_mock(
        data=[{"id": "n1", "user_id": "u1"}, {"id": "n2", "user_id": "u1"}]
    )
    with patch.object(codex_service, "_get_client", return_value=client):
        result = codex_service.list_novels(user_id="u1")
    assert len(result) == 2
    eq_calls = builder.eq.call_args_list
    assert any(c == (("user_id", "u1"),) for c in eq_calls)


def test_list_novels_orders_by_created_at_desc():
    """list_novels sắp xếp theo created_at giảm dần."""
    client, builder = _make_supabase_mock(data=[])
    with patch.object(codex_service, "_get_client", return_value=client):
        codex_service.list_novels(user_id="u1")
    builder.order.assert_called_with("created_at", desc=True)


def test_list_novels_empty_returns_empty_list():
    """list_novels trả về [] khi user chưa có novel nào."""
    client, _ = _make_supabase_mock(data=[])
    with patch.object(codex_service, "_get_client", return_value=client):
        result = codex_service.list_novels(user_id="u1")
    assert result == []


# --- get_novel ---

def test_get_novel_returns_record_when_found():
    """get_novel trả về record khi tìm thấy."""
    client, _ = _make_supabase_mock(
        data=[{"id": "n1", "user_id": "u1", "title": "T"}]
    )
    with patch.object(codex_service, "_get_client", return_value=client):
        result = codex_service.get_novel(novel_id="n1", user_id="u1")
    assert result["id"] == "n1"
    assert result["title"] == "T"


def test_get_novel_returns_none_when_not_found():
    """get_novel trả về None khi novel không tồn tại hoặc không thuộc user."""
    client, _ = _make_supabase_mock(data=[])
    with patch.object(codex_service, "_get_client", return_value=client):
        result = codex_service.get_novel(novel_id="n1", user_id="u1")
    assert result is None


def test_get_novel_filters_by_both_id_and_user():
    """get_novel lọc theo cả id và user_id để enforce ownership."""
    client, builder = _make_supabase_mock(data=[{"id": "n1"}])
    with patch.object(codex_service, "_get_client", return_value=client):
        codex_service.get_novel(novel_id="n1", user_id="u1")
    eq_calls = builder.eq.call_args_list
    assert any(c == (("id", "n1"),) for c in eq_calls)
    assert any(c == (("user_id", "u1"),) for c in eq_calls)


# --- _get_client ---

def test_get_client_raises_without_env_vars(monkeypatch):
    """_get_client raises RuntimeError khi thiếu env vars."""
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    with pytest.raises(RuntimeError, match="SUPABASE_URL"):
        codex_service._get_client()
