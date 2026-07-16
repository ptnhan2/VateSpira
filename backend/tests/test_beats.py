"""Tests cho beat CRUD functions (codex_service) + beat @tools (agent).

Mock Supabase client qua patch.object(codex_service, "_get_client") để test
logic CRUD. E2E tests kết nối Supabase thật (dùng VATESPIRA_DEV_USER_ID).

Beat @tools (list_beats, update_beat) test qua .func() để bypass tool
invocation machinery. ToolRuntime mock chứa cả user_id + novel_id.
"""

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


def _make_write_ok():
    """Tạo mock WriteResult thành công (error=None)."""
    return MagicMock(error=None, path="/mock")


@pytest.fixture(autouse=True)
def _reset_client_singleton():
    """Reset _client singleton trước và sau mỗi test để tránh leak state."""
    codex_service._client = None
    yield
    codex_service._client = None


# =============================================================================
# Mock tests — codex_service.init_beats
# =============================================================================


def test_init_beats_inserts_15_rows():
    """init_beats insert đúng số rows với beat_number, beat_name, content, status."""
    client, builder = _make_supabase_mock(data=[])
    # First execute (existing check) → empty; second (insert) → inserted rows
    result_empty = MagicMock(data=[])
    result_inserted = MagicMock(
        data=[{"id": f"b{i}", "beat_number": i + 1} for i in range(3)]
    )
    builder.execute.side_effect = [result_empty, result_inserted]
    with patch.object(codex_service, "_get_client", return_value=client):
        codex_service.init_beats(
            novel_id="n1", beat_names=["Opening Image", "Theme Stated", "Set-Up"]
        )
    insert_payload = builder.insert.call_args[0][0]
    assert len(insert_payload) == 3
    assert insert_payload[0]["beat_number"] == 1
    assert insert_payload[0]["beat_name"] == "Opening Image"
    assert insert_payload[0]["content"] is None
    assert insert_payload[0]["status"] == "empty"
    assert insert_payload[2]["beat_number"] == 3
    assert insert_payload[2]["beat_name"] == "Set-Up"


def test_init_beats_idempotent_returns_existing():
    """init_beats trả về existing rows khi đã có beats, KHÔNG insert."""
    existing_data = [{"id": f"b{i}", "beat_number": i + 1} for i in range(15)]
    client, builder = _make_supabase_mock(data=existing_data)
    with patch.object(codex_service, "_get_client", return_value=client):
        result = codex_service.init_beats(
            novel_id="n1",
            beat_names=["A", "B", "C"],
        )
    assert len(result) == 15
    builder.insert.assert_not_called()


def test_init_beats_idempotent_returns_existing_if_any():
    """init_beats trả về existing rows khi có bất kỳ beat nào, KHÔNG insert.

    Partial state (VD 5/15 rows) là edge case — return what exists, không
    insert thêm (tránh UNIQUE constraint violation).
    """
    existing_data = [{"id": f"b{i}", "beat_number": i + 1} for i in range(5)]
    client, builder = _make_supabase_mock(data=existing_data)
    with patch.object(codex_service, "_get_client", return_value=client):
        result = codex_service.init_beats(
            novel_id="n1",
            beat_names=["A", "B", "C"],
        )
    assert len(result) == 5
    builder.insert.assert_not_called()


# =============================================================================
# Mock tests — codex_service.list_beats
# =============================================================================


def test_list_beats_filters_by_novel_id_and_user():
    """list_beats lọc theo novel_id + novels.user_id qua join."""
    client, builder = _make_supabase_mock(
        data=[{"id": "b1", "beat_number": 1, "novel_id": "n1"}]
    )
    with patch.object(codex_service, "_get_client", return_value=client):
        result = codex_service.list_beats(novel_id="n1", user_id="u1")
    assert len(result) == 1
    # Verify select includes join
    select_arg = builder.select.call_args[0][0]
    assert "novels" in select_arg
    # Verify eq filters
    eq_calls = builder.eq.call_args_list
    assert any(c == (("novel_id", "n1"),) for c in eq_calls)
    assert any(c == (("novels.user_id", "u1"),) for c in eq_calls)


def test_list_beats_orders_by_beat_number():
    """list_beats sắp xếp theo beat_number tăng dần."""
    client, builder = _make_supabase_mock(data=[])
    with patch.object(codex_service, "_get_client", return_value=client):
        codex_service.list_beats(novel_id="n1", user_id="u1")
    builder.order.assert_called_with("beat_number")


def test_list_beats_empty_returns_empty_list():
    """list_beats trả về [] khi không có beats hoặc không thuộc user."""
    client, _ = _make_supabase_mock(data=[])
    with patch.object(codex_service, "_get_client", return_value=client):
        result = codex_service.list_beats(novel_id="n1", user_id="u1")
    assert result == []


# =============================================================================
# Mock tests — codex_service.update_beat
# =============================================================================


def test_update_beat_updates_content_and_status():
    """update_beat gửi update payload {content, status='filled'}."""
    client, builder = _make_supabase_mock(
        data=[{"id": "b1", "beat_number": 1, "content": "new", "status": "filled"}]
    )
    with (
        patch.object(codex_service, "_get_client", return_value=client),
        patch.object(codex_service, "get_novel", return_value={"id": "n1"}),
    ):
        result = codex_service.update_beat(
            novel_id="n1", beat_number=1, content="new content", user_id="u1"
        )
    assert result["content"] == "new"
    assert result["status"] == "filled"
    update_payload = builder.update.call_args[0][0]
    assert update_payload["content"] == "new content"
    assert update_payload["status"] == "filled"


def test_update_beat_returns_none_when_novel_not_owned():
    """update_beat trả về None khi novel không thuộc user."""
    client, _ = _make_supabase_mock(data=[])
    with (
        patch.object(codex_service, "_get_client", return_value=client),
        patch.object(codex_service, "get_novel", return_value=None),
    ):
        result = codex_service.update_beat(
            novel_id="n1", beat_number=1, content="new", user_id="u1"
        )
    assert result is None


def test_update_beat_returns_none_when_beat_not_found():
    """update_beat trả về None khi beat_number không tồn tại."""
    client, _ = _make_supabase_mock(data=[])
    with (
        patch.object(codex_service, "_get_client", return_value=client),
        patch.object(codex_service, "get_novel", return_value={"id": "n1"}),
    ):
        result = codex_service.update_beat(
            novel_id="n1", beat_number=99, content="new", user_id="u1"
        )
    assert result is None


# =============================================================================
# Mock tests — agent SAVE_THE_CAT_BEATS constant
# =============================================================================


def test_save_the_cat_beats_has_15_entries():
    """SAVE_THE_CAT_BEATS constant có đúng 15 beat names."""
    assert len(agent.SAVE_THE_CAT_BEATS) == 15


def test_save_the_cat_beats_first_and_last():
    """SAVE_THE_CAT_BEATS[0] = 'Opening Image', [14] = 'Final Image'."""
    assert agent.SAVE_THE_CAT_BEATS[0] == "Opening Image"
    assert agent.SAVE_THE_CAT_BEATS[14] == "Final Image"


# =============================================================================
# Mock tests — agent list_beats @tool
# =============================================================================


def test_list_beats_tool_extracts_ids_and_calls_service():
    """list_beats tool trích xuất user_id + novel_id, gọi codex_service."""
    rt = _make_runtime(user_id="u1", novel_id="n1")
    with patch.object(
        agent.codex_service, "list_beats", return_value=[{"id": "b1"}]
    ) as mock_fn:
        result = agent.list_beats.func(runtime=rt)
    import json

    parsed = json.loads(result)
    assert len(parsed) == 1
    mock_fn.assert_called_once_with(novel_id="n1", user_id="u1")


def test_list_beats_tool_raises_without_user_id():
    """list_beats tool raises ValueError khi no user_id."""
    rt = _make_runtime(novel_id="n1")
    with patch.object(agent.codex_service, "list_beats") as mock_fn:
        with pytest.raises(ValueError, match="user_id"):
            agent.list_beats.func(runtime=rt)
    mock_fn.assert_not_called()


def test_list_beats_tool_raises_without_novel_id():
    """list_beats tool raises ValueError khi no novel_id."""
    rt = _make_runtime(user_id="u1")
    with patch.object(agent.codex_service, "list_beats") as mock_fn:
        with pytest.raises(ValueError, match="novel_id"):
            agent.list_beats.func(runtime=rt)
    mock_fn.assert_not_called()


# =============================================================================
# Mock tests — agent update_beat @tool
# =============================================================================


def test_update_beat_tool_extracts_ids_and_calls_service():
    """update_beat tool trích xuất ids, gọi service với beat_number + content."""
    rt = _make_runtime(user_id="u1", novel_id="n1")
    with patch.object(
        agent.codex_service,
        "update_beat",
        return_value={"id": "b1", "content": "new", "status": "filled"},
    ) as mock_fn:
        result = agent.update_beat.func(
            beat_number=1, content="new content", runtime=rt
        )
    import json

    parsed = json.loads(result)
    assert parsed["content"] == "new"
    mock_fn.assert_called_once_with(
        novel_id="n1", beat_number=1, content="new content", user_id="u1"
    )


def test_update_beat_tool_returns_error_json_when_not_found():
    """update_beat tool trả về JSON error khi service trả None."""
    rt = _make_runtime(user_id="u1", novel_id="n1")
    with patch.object(agent.codex_service, "update_beat", return_value=None):
        result = agent.update_beat.func(
            beat_number=1, content="new", runtime=rt
        )
    import json

    parsed = json.loads(result)
    assert "error" in parsed
    assert "1" in parsed["error"]


def test_update_beat_tool_raises_without_user_id():
    """update_beat tool raises ValueError khi no user_id."""
    rt = _make_runtime(novel_id="n1")
    with patch.object(agent.codex_service, "update_beat") as mock_fn:
        with pytest.raises(ValueError, match="user_id"):
            agent.update_beat.func(beat_number=1, content="new", runtime=rt)
    mock_fn.assert_not_called()


def test_update_beat_tool_raises_without_novel_id():
    """update_beat tool raises ValueError khi no novel_id."""
    rt = _make_runtime(user_id="u1")
    with patch.object(agent.codex_service, "update_beat") as mock_fn:
        with pytest.raises(ValueError, match="novel_id"):
            agent.update_beat.func(beat_number=1, content="new", runtime=rt)
    mock_fn.assert_not_called()


# =============================================================================
# Mock tests — agent create_novel + init_beats
# =============================================================================


def test_create_novel_tool_calls_init_beats():
    """create_novel tool gọi init_beats với SAVE_THE_CAT_BEATS sau khi tạo novel."""
    rt = _make_runtime(user_id="u1")
    with (
        patch.object(
            agent.codex_service, "create_novel", return_value={"id": "n1", "title": "T"}
        ),
        patch.object(
            agent.codex_service, "init_beats", return_value=[{"id": "b1"}]
        ) as mock_init,
        patch.object(agent, "backend"),
    ):
        agent.create_novel.func(title="T", runtime=rt)
    mock_init.assert_called_once()
    assert mock_init.call_args.kwargs["beat_names"] == agent.SAVE_THE_CAT_BEATS
    assert mock_init.call_args.kwargs["novel_id"] == "n1"


def test_create_novel_tool_init_beats_best_effort():
    """create_novel tool vẫn return success khi init_beats raise Exception.

    Best-effort pattern: init_beats fail → record error in beats_init,
    scaffold vẫn chạy, create_novel vẫn return success.
    """
    rt = _make_runtime(user_id="u1")
    mock_backend = MagicMock()
    mock_backend.write.return_value = _make_write_ok()
    with (
        patch.object(
            agent.codex_service, "create_novel", return_value={"id": "n1", "title": "T"}
        ),
        patch.object(
            agent.codex_service, "init_beats", side_effect=Exception("table missing")
        ),
        patch.object(agent, "backend", mock_backend),
    ):
        result = agent.create_novel.func(title="T", runtime=rt)
    import json

    parsed = json.loads(result)
    assert parsed["id"] == "n1"
    assert isinstance(parsed["beats_init"], list)
    assert "error" in parsed["beats_init"][0]
    assert "table missing" in parsed["beats_init"][0]["error"]
    assert isinstance(parsed["scaffold"], list)


# =============================================================================
# Mock tests — tools wiring
# =============================================================================


def test_all_five_tools_are_base_tool_instances():
    """5 tools (create_novel, list_novels, get_novel, list_beats, update_beat) là BaseTool."""
    assert isinstance(agent.create_novel, BaseTool)
    assert isinstance(agent.list_novels, BaseTool)
    assert isinstance(agent.get_novel, BaseTool)
    assert isinstance(agent.list_beats, BaseTool)
    assert isinstance(agent.update_beat, BaseTool)


# =============================================================================
# E2E tests — real Supabase (require VATESPIRA_DEV_USER_ID + beats table)
# =============================================================================

_E2E_USER_ID = os.environ.get("VATESPIRA_DEV_USER_ID")


@pytest.mark.skipif(not _E2E_USER_ID, reason="VATESPIRA_DEV_USER_ID not set")
class TestE2EBeats:
    """E2E tests với real Supabase — require beats table (migration 00003 applied)."""

    @pytest.fixture
    def test_novel(self):
        """Tạo test novel cho E2E, cleanup sau test (cascade delete beats)."""
        novel = codex_service.create_novel(
            user_id=_E2E_USER_ID, title="E2E Test Beats Novel"
        )
        yield novel
        client = codex_service._get_client()
        client.table("novels").delete().eq("id", novel["id"]).execute()

    def test_e2e_init_and_list_beats(self, test_novel):
        """init_beats tạo 15 rows → list_beats trả 15 rows với đúng beat_name."""
        beats = codex_service.init_beats(
            novel_id=test_novel["id"], beat_names=agent.SAVE_THE_CAT_BEATS
        )
        assert len(beats) == 15
        listed = codex_service.list_beats(
            novel_id=test_novel["id"], user_id=_E2E_USER_ID
        )
        assert len(listed) == 15
        assert listed[0]["beat_number"] == 1
        assert listed[0]["beat_name"] == "Opening Image"
        assert listed[14]["beat_number"] == 15
        assert listed[14]["beat_name"] == "Final Image"
        assert listed[0]["status"] == "empty"
        assert listed[0]["content"] is None

    def test_e2e_update_beat(self, test_novel):
        """update_beat sửa content + status='filled' → list_beats verify."""
        codex_service.init_beats(
            novel_id=test_novel["id"], beat_names=agent.SAVE_THE_CAT_BEATS
        )
        updated = codex_service.update_beat(
            novel_id=test_novel["id"],
            beat_number=1,
            content="A dark city skyline at dawn.",
            user_id=_E2E_USER_ID,
        )
        assert updated is not None
        assert updated["content"] == "A dark city skyline at dawn."
        assert updated["status"] == "filled"
        listed = codex_service.list_beats(
            novel_id=test_novel["id"], user_id=_E2E_USER_ID
        )
        beat1 = next(b for b in listed if b["beat_number"] == 1)
        assert beat1["content"] == "A dark city skyline at dawn."
        assert beat1["status"] == "filled"

    def test_e2e_list_beats_wrong_user_returns_empty(self, test_novel):
        """list_beats với wrong user_id → empty list (ownership enforced)."""
        codex_service.init_beats(
            novel_id=test_novel["id"], beat_names=agent.SAVE_THE_CAT_BEATS
        )
        listed = codex_service.list_beats(
            novel_id=test_novel["id"],
            user_id="00000000-0000-0000-0000-000000000000",
        )
        assert listed == []

    def test_e2e_update_beat_wrong_user_returns_none(self, test_novel):
        """update_beat với wrong user_id → None (ownership enforced)."""
        codex_service.init_beats(
            novel_id=test_novel["id"], beat_names=agent.SAVE_THE_CAT_BEATS
        )
        result = codex_service.update_beat(
            novel_id=test_novel["id"],
            beat_number=1,
            content="should not work",
            user_id="00000000-0000-0000-0000-000000000000",
        )
        assert result is None
