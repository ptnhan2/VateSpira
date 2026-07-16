"""Tests cho chapter CRUD functions (codex_service) + chapter @tools (agent) + RubricMiddleware.

Mock Supabase client qua patch.object(codex_service, "_get_client") để test
logic CRUD. E2E tests kết nối Supabase thật (dùng VATESPIRA_DEV_USER_ID).

Chapter @tools (save_chapter_metadata, list_chapters) test qua .func() để
bypass tool invocation machinery. ToolRuntime mock chứa user_id + novel_id.

RubricMiddleware tests: verify CHAPTER_RUBRIC_PROMPT có 5 tiêu chí, middleware
no-op khi rubric empty, grader model hardcoded (không bị BYOK override).
"""

import json
import os
from unittest.mock import MagicMock, patch

import pytest
from langchain_core.tools import BaseTool
from langgraph.prebuilt import ToolRuntime

import agent
import codex_service


# --- Helpers ---


def _make_supabase_mock(data=None):
    """Tạo mock Supabase client với fluent query builder chaining.

    Builder methods (select/insert/update/eq/order) return self để mock
    chaining. execute() trả về result object có .data.

    Args:
        data: Giá trị trả về cho result.data (default []).

    Returns:
        Tuple (client_mock, builder_mock).
    """
    client = MagicMock()
    builder = MagicMock()
    builder.select.return_value = builder
    builder.insert.return_value = builder
    builder.update.return_value = builder
    builder.eq.return_value = builder
    builder.order.return_value = builder
    result = MagicMock()
    result.data = data if data is not None else []
    builder.execute.return_value = result
    client.table.return_value = builder
    return client, builder


def _make_runtime(user_id=None, novel_id=None):
    """Tạo ToolRuntime mock với context chứa user_id + novel_id.

    Args:
        user_id: Giá trị user_id trong context (None = not set).
        novel_id: Giá trị novel_id trong context (None = not set).

    Returns:
        ToolRuntime instance với context dict hoặc None.
    """
    ctx = {}
    if user_id is not None:
        ctx["user_id"] = user_id
    if novel_id is not None:
        ctx["novel_id"] = novel_id
    return ToolRuntime(
        state=None,
        context=ctx if ctx else None,
        config={},
        stream_writer=None,
        tool_call_id="test-call",
        store=None,
    )


@pytest.fixture(autouse=True)
def _reset_client_singleton():
    """Reset _client singleton trước và sau mỗi test để tránh leak state."""
    codex_service._client = None
    yield
    codex_service._client = None


# =============================================================================
# Mock tests — codex_service.create_chapter
# =============================================================================


def test_create_chapter_inserts_with_word_count():
    """create_chapter insert row với word_count tự tính từ content."""
    client, builder = _make_supabase_mock()
    result_existing = MagicMock(data=[])  # no existing chapter
    result_insert = MagicMock(
        data=[{"id": "ch1", "number": 1, "title": "T", "word_count": 5, "status": "draft"}]
    )
    builder.execute.side_effect = [result_existing, result_insert]
    with (
        patch.object(codex_service, "_get_client", return_value=client),
        patch.object(codex_service, "get_novel", return_value={"id": "n1"}),
    ):
        result = codex_service.create_chapter(
            novel_id="n1", chapter_number=1, title="T", content="one two three four five", user_id="u1"
        )
    assert result["word_count"] == 5
    insert_payload = builder.insert.call_args[0][0]
    assert insert_payload["novel_id"] == "n1"
    assert insert_payload["number"] == 1
    assert insert_payload["title"] == "T"
    assert insert_payload["word_count"] == 5
    assert insert_payload["status"] == "draft"


def test_create_chapter_empty_content_word_count_zero():
    """create_chapter word_count=0 khi content rỗng."""
    client, builder = _make_supabase_mock()
    result_existing = MagicMock(data=[])
    result_insert = MagicMock(data=[{"id": "ch1", "word_count": 0}])
    builder.execute.side_effect = [result_existing, result_insert]
    with (
        patch.object(codex_service, "_get_client", return_value=client),
        patch.object(codex_service, "get_novel", return_value={"id": "n1"}),
    ):
        result = codex_service.create_chapter(
            novel_id="n1", chapter_number=1, title="T", content="", user_id="u1"
        )
    assert result["word_count"] == 0
    insert_payload = builder.insert.call_args[0][0]
    assert insert_payload["word_count"] == 0


def test_create_chapter_updates_existing():
    """create_chapter update existing chapter khi (novel_id, number) đã tồn tại."""
    client, builder = _make_supabase_mock()
    result_existing = MagicMock(data=[{"id": "ch1"}])  # existing chapter
    result_update = MagicMock(
        data=[{"id": "ch1", "title": "New", "word_count": 3, "status": "draft"}]
    )
    builder.execute.side_effect = [result_existing, result_update]
    with (
        patch.object(codex_service, "_get_client", return_value=client),
        patch.object(codex_service, "get_novel", return_value={"id": "n1"}),
    ):
        result = codex_service.create_chapter(
            novel_id="n1", chapter_number=1, title="New", content="one two three", user_id="u1"
        )
    assert result["title"] == "New"
    update_payload = builder.update.call_args[0][0]
    assert update_payload["title"] == "New"
    assert update_payload["word_count"] == 3
    assert update_payload["status"] == "draft"
    assert "updated_at" in update_payload
    # Verify update filtered by existing chapter id
    eq_calls = builder.eq.call_args_list
    assert any(c == (("id", "ch1"),) for c in eq_calls)
    # Verify insert NOT called (upsert path took update)
    builder.insert.assert_not_called()


def test_create_chapter_returns_none_when_novel_not_owned():
    """create_chapter trả None khi novel không thuộc user."""
    client, _ = _make_supabase_mock(data=[])
    with (
        patch.object(codex_service, "_get_client", return_value=client),
        patch.object(codex_service, "get_novel", return_value=None),
    ):
        result = codex_service.create_chapter(
            novel_id="n1", chapter_number=1, title="T", content="text", user_id="wrong"
        )
    assert result is None


def test_create_chapter_first_chapter_inserts():
    """create_chapter insert (không update) khi chưa có chapter nào."""
    client, builder = _make_supabase_mock()
    result_existing = MagicMock(data=[])  # no existing
    result_insert = MagicMock(data=[{"id": "ch1", "number": 1}])
    builder.execute.side_effect = [result_existing, result_insert]
    with (
        patch.object(codex_service, "_get_client", return_value=client),
        patch.object(codex_service, "get_novel", return_value={"id": "n1"}),
    ):
        codex_service.create_chapter(
            novel_id="n1", chapter_number=1, title="Ch1", content="hello world", user_id="u1"
        )
    # Verify insert called, update NOT called
    builder.insert.assert_called_once()
    builder.update.assert_not_called()


# =============================================================================
# Mock tests — codex_service.list_chapters
# =============================================================================


def test_list_chapters_filters_by_novel_id_and_user():
    """list_chapters lọc theo novel_id + novels.user_id qua join."""
    client, builder = _make_supabase_mock(
        data=[{"id": "ch1", "number": 1, "title": "T"}]
    )
    with patch.object(codex_service, "_get_client", return_value=client):
        result = codex_service.list_chapters(novel_id="n1", user_id="u1")
    assert len(result) == 1
    select_arg = builder.select.call_args[0][0]
    assert "novels" in select_arg
    eq_calls = builder.eq.call_args_list
    assert any(c == (("novel_id", "n1"),) for c in eq_calls)
    assert any(c == (("novels.user_id", "u1"),) for c in eq_calls)


def test_list_chapters_orders_by_number():
    """list_chapters sắp xếp theo number tăng dần."""
    client, builder = _make_supabase_mock(data=[])
    with patch.object(codex_service, "_get_client", return_value=client):
        codex_service.list_chapters(novel_id="n1", user_id="u1")
    builder.order.assert_called_with("number")


def test_list_chapters_empty_returns_empty_list():
    """list_chapters trả [] khi không có chapters hoặc không thuộc user."""
    client, _ = _make_supabase_mock(data=[])
    with patch.object(codex_service, "_get_client", return_value=client):
        result = codex_service.list_chapters(novel_id="n1", user_id="u1")
    assert result == []


# =============================================================================
# Mock tests — codex_service.get_chapter
# =============================================================================


def test_get_chapter_returns_record_when_found():
    """get_chapter trả record khi tìm thấy."""
    client, builder = _make_supabase_mock(
        data=[{"id": "ch1", "number": 1, "title": "T"}]
    )
    with patch.object(codex_service, "_get_client", return_value=client):
        result = codex_service.get_chapter(novel_id="n1", chapter_number=1, user_id="u1")
    assert result["id"] == "ch1"
    select_arg = builder.select.call_args[0][0]
    assert "novels" in select_arg
    eq_calls = builder.eq.call_args_list
    assert any(c == (("novel_id", "n1"),) for c in eq_calls)
    assert any(c == (("number", 1),) for c in eq_calls)
    assert any(c == (("novels.user_id", "u1"),) for c in eq_calls)


def test_get_chapter_returns_none_when_not_found():
    """get_chapter trả None khi chapter không tồn tại hoặc không thuộc user."""
    client, _ = _make_supabase_mock(data=[])
    with patch.object(codex_service, "_get_client", return_value=client):
        result = codex_service.get_chapter(novel_id="n1", chapter_number=99, user_id="u1")
    assert result is None


# =============================================================================
# Mock tests — agent save_chapter_metadata @tool
# =============================================================================


def test_save_chapter_metadata_tool_extracts_ids_and_calls_service():
    """save_chapter_metadata tool trích xuất user_id + novel_id, gọi codex_service."""
    rt = _make_runtime(user_id="u1", novel_id="n1")
    with patch.object(
        agent.codex_service,
        "create_chapter",
        return_value={"id": "ch1", "number": 1, "title": "T", "word_count": 2},
    ) as mock_fn:
        result = agent.save_chapter_metadata.func(
            chapter_number=1, title="T", content="hello world", runtime=rt
        )
    parsed = json.loads(result)
    assert parsed["id"] == "ch1"
    mock_fn.assert_called_once_with(
        novel_id="n1", chapter_number=1, title="T", content="hello world", user_id="u1"
    )


def test_save_chapter_metadata_tool_returns_error_when_service_none():
    """save_chapter_metadata tool trả JSON error khi service trả None (wrong user)."""
    rt = _make_runtime(user_id="u1", novel_id="n1")
    with patch.object(agent.codex_service, "create_chapter", return_value=None):
        result = agent.save_chapter_metadata.func(
            chapter_number=1, title="T", content="text", runtime=rt
        )
    parsed = json.loads(result)
    assert "error" in parsed


def test_save_chapter_metadata_tool_raises_without_user_id():
    """save_chapter_metadata tool raises ValueError khi no user_id."""
    rt = _make_runtime(novel_id="n1")
    with patch.object(agent.codex_service, "create_chapter") as mock_fn:
        with pytest.raises(ValueError, match="user_id"):
            agent.save_chapter_metadata.func(
                chapter_number=1, title="T", content="text", runtime=rt
            )
    mock_fn.assert_not_called()


def test_save_chapter_metadata_tool_raises_without_novel_id():
    """save_chapter_metadata tool raises ValueError khi no novel_id."""
    rt = _make_runtime(user_id="u1")
    with patch.object(agent.codex_service, "create_chapter") as mock_fn:
        with pytest.raises(ValueError, match="novel_id"):
            agent.save_chapter_metadata.func(
                chapter_number=1, title="T", content="text", runtime=rt
            )
    mock_fn.assert_not_called()


# =============================================================================
# Mock tests — agent list_chapters @tool
# =============================================================================


def test_list_chapters_tool_extracts_ids_and_calls_service():
    """list_chapters tool trích xuất user_id + novel_id, gọi codex_service."""
    rt = _make_runtime(user_id="u1", novel_id="n1")
    with patch.object(
        agent.codex_service,
        "list_chapters",
        return_value=[{"id": "ch1", "number": 1, "title": "Ch1"}],
    ) as mock_fn:
        result = agent.list_chapters.func(runtime=rt)
    parsed = json.loads(result)
    assert len(parsed) == 1
    mock_fn.assert_called_once_with(novel_id="n1", user_id="u1")


def test_list_chapters_tool_raises_without_user_id():
    """list_chapters tool raises ValueError khi no user_id."""
    rt = _make_runtime(novel_id="n1")
    with patch.object(agent.codex_service, "list_chapters") as mock_fn:
        with pytest.raises(ValueError, match="user_id"):
            agent.list_chapters.func(runtime=rt)
    mock_fn.assert_not_called()


def test_list_chapters_tool_raises_without_novel_id():
    """list_chapters tool raises ValueError khi no novel_id."""
    rt = _make_runtime(user_id="u1")
    with patch.object(agent.codex_service, "list_chapters") as mock_fn:
        with pytest.raises(ValueError, match="novel_id"):
            agent.list_chapters.func(runtime=rt)
    mock_fn.assert_not_called()


# =============================================================================
# Rubric tests — CHAPTER_RUBRIC_PROMPT + RubricMiddleware
# =============================================================================


def test_chapter_rubric_prompt_contains_5_criteria():
    """CHAPTER_RUBRIC_PROMPT chứa đủ 5 tiêu chí đánh giá."""
    prompt = agent.CHAPTER_RUBRIC_PROMPT
    assert "Beat Alignment" in prompt
    assert "Voice" in prompt
    assert "POV" in prompt
    assert "Show" in prompt and "Tell" in prompt
    assert "Character Consistency" in prompt
    assert "Pacing" in prompt
    # Verify verdict rules mentioned
    assert "satisfied" in prompt
    assert "needs_revision" in prompt
    assert "failed" in prompt


def test_rubric_middleware_noop_when_rubric_empty():
    """RubricMiddleware before_agent trả None khi state không có rubric (no-op)."""
    from deepagents import RubricMiddleware

    mw = RubricMiddleware(
        model="deepseek:deepseek-chat",
        system_prompt="test prompt",
        max_iterations=3,
    )
    result = mw.before_agent({}, MagicMock())
    assert result is None


def test_rubric_middleware_constructable_with_chapter_rubric():
    """RubricMiddleware construct được với CHAPTER_RUBRIC_PROMPT, grader model hardcoded.

    Grader model = "deepseek:deepseek-chat" (hardcoded trong constructor),
    KHÔNG bị BYOKMiddleware override (BYOK chỉ wrap main agent model qua
    wrap_model_call, grader là separate create_agent trong _ensure_grader).
    """
    from deepagents import RubricMiddleware

    mw = RubricMiddleware(
        model="deepseek:deepseek-chat",
        system_prompt=agent.CHAPTER_RUBRIC_PROMPT,
        max_iterations=3,
    )
    assert mw.max_iterations == 3
    assert mw._model == "deepseek:deepseek-chat"


# =============================================================================
# Mock tests — tools wiring
# =============================================================================


def test_chapter_tools_are_base_tool_instances():
    """2 chapter tools (save_chapter_metadata, list_chapters) là BaseTool."""
    assert isinstance(agent.save_chapter_metadata, BaseTool)
    assert isinstance(agent.list_chapters, BaseTool)


# =============================================================================
# E2E tests — real Supabase (require VATESPIRA_DEV_USER_ID + chapters table)
# =============================================================================

_E2E_USER_ID = os.environ.get("VATESPIRA_DEV_USER_ID")


@pytest.mark.skipif(not _E2E_USER_ID, reason="VATESPIRA_DEV_USER_ID not set")
class TestE2EChapters:
    """E2E tests với real Supabase — require chapters table (migration 00001 applied)."""

    @pytest.fixture
    def test_novel(self):
        """Tạo test novel cho E2E, cleanup sau test (cascade delete chapters)."""
        novel = codex_service.create_novel(
            user_id=_E2E_USER_ID, title="E2E Test Chapters Novel"
        )
        yield novel
        client = codex_service._get_client()
        client.table("novels").delete().eq("id", novel["id"]).execute()

    def test_e2e_create_and_list_chapters(self, test_novel):
        """create_chapter 2 chapters → list_chapters trả 2, ordered by number."""
        codex_service.create_chapter(
            novel_id=test_novel["id"],
            chapter_number=1,
            title="Chapter One",
            content="The dawn broke over the city.",
            user_id=_E2E_USER_ID,
        )
        codex_service.create_chapter(
            novel_id=test_novel["id"],
            chapter_number=2,
            title="Chapter Two",
            content="Night fell softly.",
            user_id=_E2E_USER_ID,
        )
        listed = codex_service.list_chapters(
            novel_id=test_novel["id"], user_id=_E2E_USER_ID
        )
        assert len(listed) == 2
        assert listed[0]["number"] == 1
        assert listed[0]["title"] == "Chapter One"
        assert listed[1]["number"] == 2
        assert listed[1]["title"] == "Chapter Two"
        assert listed[0]["status"] == "draft"

    def test_e2e_create_chapter_word_count(self, test_novel):
        """create_chapter word_count auto-calc đúng từ content."""
        content = "The quick brown fox jumps over the lazy dog."
        codex_service.create_chapter(
            novel_id=test_novel["id"],
            chapter_number=1,
            title="Word Count Test",
            content=content,
            user_id=_E2E_USER_ID,
        )
        listed = codex_service.list_chapters(
            novel_id=test_novel["id"], user_id=_E2E_USER_ID
        )
        assert listed[0]["word_count"] == len(content.split())

    def test_e2e_create_chapter_upsert(self, test_novel):
        """create_chapter 2 lần cùng number → update (không tạo duplicate)."""
        codex_service.create_chapter(
            novel_id=test_novel["id"],
            chapter_number=1,
            title="Original",
            content="original content here",
            user_id=_E2E_USER_ID,
        )
        codex_service.create_chapter(
            novel_id=test_novel["id"],
            chapter_number=1,
            title="Updated Title",
            content="updated content here now",
            user_id=_E2E_USER_ID,
        )
        listed = codex_service.list_chapters(
            novel_id=test_novel["id"], user_id=_E2E_USER_ID
        )
        assert len(listed) == 1  # no duplicate
        assert listed[0]["title"] == "Updated Title"
        assert listed[0]["word_count"] == 4  # "updated content here now"

    def test_e2e_list_chapters_wrong_user_returns_empty(self, test_novel):
        """list_chapters với wrong user_id → empty list (ownership enforced)."""
        codex_service.create_chapter(
            novel_id=test_novel["id"],
            chapter_number=1,
            title="Ch1",
            content="some content",
            user_id=_E2E_USER_ID,
        )
        listed = codex_service.list_chapters(
            novel_id=test_novel["id"],
            user_id="00000000-0000-0000-0000-000000000000",
        )
        assert listed == []

    def test_e2e_create_chapter_wrong_user_returns_none(self, test_novel):
        """create_chapter với wrong user_id → None (ownership enforced)."""
        result = codex_service.create_chapter(
            novel_id=test_novel["id"],
            chapter_number=1,
            title="hack",
            content="hack content",
            user_id="00000000-0000-0000-0000-000000000000",
        )
        assert result is None
