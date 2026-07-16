"""Tests cho scene CRUD functions (codex_service) + scene @tools (agent).

Mock Supabase client qua patch.object(codex_service, "_get_client") để test
logic CRUD. E2E tests kết nối Supabase thật (dùng VATESPIRA_DEV_USER_ID).

Scene @tools (list_scenes, create_scene, update_scene) test qua .func() để
bypass tool invocation machinery. ToolRuntime mock chứa user_id + novel_id.
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
# Mock tests — codex_service.list_scenes
# =============================================================================


def test_list_scenes_filters_by_novel_id_and_user():
    """list_scenes lọc theo novel_id + novels.user_id qua join."""
    client, builder = _make_supabase_mock(
        data=[{"id": "s1", "beat_id": "b1", "scene_number": 1}]
    )
    with patch.object(codex_service, "_get_client", return_value=client):
        result = codex_service.list_scenes(novel_id="n1", user_id="u1")
    assert len(result) == 1
    select_arg = builder.select.call_args[0][0]
    assert "novels" in select_arg
    eq_calls = builder.eq.call_args_list
    assert any(c == (("novel_id", "n1"),) for c in eq_calls)
    assert any(c == (("novels.user_id", "u1"),) for c in eq_calls)


def test_list_scenes_orders_by_beat_id_then_scene_number():
    """list_scenes sắp xếp theo beat_id rồi scene_number (chain 2 order)."""
    client, builder = _make_supabase_mock(data=[])
    with patch.object(codex_service, "_get_client", return_value=client):
        codex_service.list_scenes(novel_id="n1", user_id="u1")
    order_calls = builder.order.call_args_list
    assert order_calls[0] == (("beat_id",),)
    assert order_calls[1] == (("scene_number",),)


def test_list_scenes_empty_returns_empty_list():
    """list_scenes trả [] khi không có scenes hoặc không thuộc user."""
    client, _ = _make_supabase_mock(data=[])
    with patch.object(codex_service, "_get_client", return_value=client):
        result = codex_service.list_scenes(novel_id="n1", user_id="u1")
    assert result == []


# =============================================================================
# Mock tests — codex_service.create_scene
# =============================================================================


def test_create_scene_auto_calcs_scene_number():
    """create_scene auto-calc scene_number = count existing + 1."""
    client, builder = _make_supabase_mock()
    result_count = MagicMock(data=[{"id": "s1"}, {"id": "s2"}])  # 2 existing
    result_insert = MagicMock(
        data=[{"id": "s3", "scene_number": 3, "title": "T"}]
    )
    builder.execute.side_effect = [result_count, result_insert]
    with (
        patch.object(codex_service, "_get_client", return_value=client),
        patch.object(codex_service, "get_novel", return_value={"id": "n1"}),
    ):
        result = codex_service.create_scene(
            novel_id="n1", beat_id="b1", title="T", summary="S", user_id="u1"
        )
    assert result["scene_number"] == 3
    insert_payload = builder.insert.call_args[0][0]
    assert insert_payload["scene_number"] == 3
    assert insert_payload["beat_id"] == "b1"
    assert insert_payload["title"] == "T"
    assert insert_payload["summary"] == "S"
    assert insert_payload["status"] == "empty"


def test_create_scene_first_scene_number_is_one():
    """create_scene scene_number=1 khi beat chưa có scene nào."""
    client, builder = _make_supabase_mock()
    result_count = MagicMock(data=[])  # 0 existing
    result_insert = MagicMock(data=[{"id": "s1", "scene_number": 1}])
    builder.execute.side_effect = [result_count, result_insert]
    with (
        patch.object(codex_service, "_get_client", return_value=client),
        patch.object(codex_service, "get_novel", return_value={"id": "n1"}),
    ):
        result = codex_service.create_scene(
            novel_id="n1", beat_id="b1", title="T", summary=None, user_id="u1"
        )
    assert result["scene_number"] == 1
    insert_payload = builder.insert.call_args[0][0]
    assert insert_payload["summary"] is None


def test_create_scene_returns_none_when_novel_not_owned():
    """create_scene trả None khi novel không thuộc user."""
    client, _ = _make_supabase_mock(data=[])
    with (
        patch.object(codex_service, "_get_client", return_value=client),
        patch.object(codex_service, "get_novel", return_value=None),
    ):
        result = codex_service.create_scene(
            novel_id="n1", beat_id="b1", title="T", summary="S", user_id="wrong"
        )
    assert result is None


# =============================================================================
# Mock tests — codex_service.update_scene
# =============================================================================


def test_update_scene_updates_title_and_summary():
    """update_scene gửi update payload {title, summary}."""
    client, builder = _make_supabase_mock()
    result_check = MagicMock(data=[{"id": "s1", "novel_id": "n1"}])
    result_update = MagicMock(
        data=[{"id": "s1", "title": "New", "summary": "NewSum"}]
    )
    builder.execute.side_effect = [result_check, result_update]
    with patch.object(codex_service, "_get_client", return_value=client):
        result = codex_service.update_scene(
            scene_id="s1", title="New", summary="NewSum", user_id="u1"
        )
    assert result["title"] == "New"
    update_payload = builder.update.call_args[0][0]
    assert update_payload["title"] == "New"
    assert update_payload["summary"] == "NewSum"


def test_update_scene_returns_none_when_not_owned():
    """update_scene trả None khi scene không thuộc user (ownership check)."""
    client, builder = _make_supabase_mock()
    result_check = MagicMock(data=[])  # not found / not owned
    builder.execute.return_value = result_check
    with patch.object(codex_service, "_get_client", return_value=client):
        result = codex_service.update_scene(
            scene_id="s1", title="New", summary="NewSum", user_id="wrong"
        )
    assert result is None


def test_update_scene_returns_none_when_not_found():
    """update_scene trả None khi update affected 0 rows."""
    client, builder = _make_supabase_mock()
    result_check = MagicMock(data=[{"id": "s1"}])
    result_update = MagicMock(data=[])  # update affected 0 rows
    builder.execute.side_effect = [result_check, result_update]
    with patch.object(codex_service, "_get_client", return_value=client):
        result = codex_service.update_scene(
            scene_id="s1", title="New", summary="NewSum", user_id="u1"
        )
    assert result is None


# =============================================================================
# Mock tests — agent list_scenes @tool
# =============================================================================


def test_list_scenes_tool_extracts_ids_and_calls_service():
    """list_scenes tool trích xuất user_id + novel_id, gọi codex_service."""
    rt = _make_runtime(user_id="u1", novel_id="n1")
    with patch.object(
        agent.codex_service, "list_scenes", return_value=[{"id": "s1"}]
    ) as mock_fn:
        result = agent.list_scenes.func(runtime=rt)
    parsed = json.loads(result)
    assert len(parsed) == 1
    mock_fn.assert_called_once_with(novel_id="n1", user_id="u1")


def test_list_scenes_tool_raises_without_user_id():
    """list_scenes tool raises ValueError khi no user_id."""
    rt = _make_runtime(novel_id="n1")
    with patch.object(agent.codex_service, "list_scenes") as mock_fn:
        with pytest.raises(ValueError, match="user_id"):
            agent.list_scenes.func(runtime=rt)
    mock_fn.assert_not_called()


def test_list_scenes_tool_raises_without_novel_id():
    """list_scenes tool raises ValueError khi no novel_id."""
    rt = _make_runtime(user_id="u1")
    with patch.object(agent.codex_service, "list_scenes") as mock_fn:
        with pytest.raises(ValueError, match="novel_id"):
            agent.list_scenes.func(runtime=rt)
    mock_fn.assert_not_called()


# =============================================================================
# Mock tests — agent create_scene @tool
# =============================================================================


def test_create_scene_tool_resolves_beat_id_and_calls_service():
    """create_scene tool resolve beat_number→beat_id qua list_beats, gọi service."""
    rt = _make_runtime(user_id="u1", novel_id="n1")
    with (
        patch.object(
            agent.codex_service,
            "list_beats",
            return_value=[{"id": "b1", "beat_number": 1}],
        ) as mock_list,
        patch.object(
            agent.codex_service, "create_scene", return_value={"id": "s1", "title": "T"}
        ) as mock_create,
    ):
        result = agent.create_scene.func(
            beat_number=1, title="Scene 1", summary="Summary", runtime=rt
        )
    parsed = json.loads(result)
    assert parsed["id"] == "s1"
    mock_list.assert_called_once_with(novel_id="n1", user_id="u1")
    mock_create.assert_called_once_with(
        novel_id="n1", beat_id="b1", title="Scene 1", summary="Summary", user_id="u1"
    )


def test_create_scene_tool_returns_error_when_beat_not_found():
    """create_scene tool trả JSON error khi beat_number không tồn tại."""
    rt = _make_runtime(user_id="u1", novel_id="n1")
    with (
        patch.object(agent.codex_service, "list_beats", return_value=[]),
        patch.object(agent.codex_service, "create_scene") as mock_create,
    ):
        result = agent.create_scene.func(
            beat_number=99, title="T", summary="S", runtime=rt
        )
    parsed = json.loads(result)
    assert "error" in parsed
    assert "99" in parsed["error"]
    mock_create.assert_not_called()


def test_create_scene_tool_returns_error_when_service_returns_none():
    """create_scene tool trả JSON error khi service trả None (wrong user)."""
    rt = _make_runtime(user_id="u1", novel_id="n1")
    with (
        patch.object(
            agent.codex_service,
            "list_beats",
            return_value=[{"id": "b1", "beat_number": 1}],
        ),
        patch.object(agent.codex_service, "create_scene", return_value=None),
    ):
        result = agent.create_scene.func(
            beat_number=1, title="T", summary="S", runtime=rt
        )
    parsed = json.loads(result)
    assert "error" in parsed


def test_create_scene_tool_converts_empty_summary_to_none():
    """create_scene tool chuyển summary rỗng thành None."""
    rt = _make_runtime(user_id="u1", novel_id="n1")
    with (
        patch.object(
            agent.codex_service,
            "list_beats",
            return_value=[{"id": "b1", "beat_number": 1}],
        ),
        patch.object(
            agent.codex_service, "create_scene", return_value={"id": "s1"}
        ) as mock_create,
    ):
        agent.create_scene.func(beat_number=1, title="T", summary="", runtime=rt)
    assert mock_create.call_args.kwargs["summary"] is None


def test_create_scene_tool_raises_without_user_id():
    """create_scene tool raises ValueError khi no user_id."""
    rt = _make_runtime(novel_id="n1")
    with patch.object(agent.codex_service, "list_beats") as mock_fn:
        with pytest.raises(ValueError, match="user_id"):
            agent.create_scene.func(beat_number=1, title="T", summary="S", runtime=rt)
    mock_fn.assert_not_called()


# =============================================================================
# Mock tests — agent update_scene @tool
# =============================================================================


def test_update_scene_tool_calls_service_and_returns_json():
    """update_scene tool trích xuất user_id, gọi service với scene_id."""
    rt = _make_runtime(user_id="u1")
    with patch.object(
        agent.codex_service,
        "update_scene",
        return_value={"id": "s1", "title": "New", "summary": "NewSum"},
    ) as mock_fn:
        result = agent.update_scene.func(
            scene_id="s1", title="New", summary="NewSum", runtime=rt
        )
    parsed = json.loads(result)
    assert parsed["title"] == "New"
    mock_fn.assert_called_once_with(
        scene_id="s1", title="New", summary="NewSum", user_id="u1"
    )


def test_update_scene_tool_returns_error_when_not_found():
    """update_scene tool trả JSON error khi service trả None."""
    rt = _make_runtime(user_id="u1")
    with patch.object(agent.codex_service, "update_scene", return_value=None):
        result = agent.update_scene.func(
            scene_id="s1", title="New", summary="NewSum", runtime=rt
        )
    parsed = json.loads(result)
    assert "error" in parsed
    assert "s1" in parsed["error"]


def test_update_scene_tool_raises_without_user_id():
    """update_scene tool raises ValueError khi no user_id."""
    rt = _make_runtime(novel_id="n1")
    with patch.object(agent.codex_service, "update_scene") as mock_fn:
        with pytest.raises(ValueError, match="user_id"):
            agent.update_scene.func(
                scene_id="s1", title="New", summary="NewSum", runtime=rt
            )
    mock_fn.assert_not_called()


# =============================================================================
# Mock tests — tools wiring
# =============================================================================


def test_scene_tools_are_base_tool_instances():
    """3 scene tools (list_scenes, create_scene, update_scene) là BaseTool."""
    assert isinstance(agent.list_scenes, BaseTool)
    assert isinstance(agent.create_scene, BaseTool)
    assert isinstance(agent.update_scene, BaseTool)


# =============================================================================
# E2E tests — real Supabase (require VATESPIRA_DEV_USER_ID + scenes table)
# =============================================================================

_E2E_USER_ID = os.environ.get("VATESPIRA_DEV_USER_ID")


@pytest.mark.skipif(not _E2E_USER_ID, reason="VATESPIRA_DEV_USER_ID not set")
class TestE2EScenes:
    """E2E tests với real Supabase — require scenes table (migration 00004 applied)."""

    @pytest.fixture
    def test_novel(self):
        """Tạo test novel cho E2E, cleanup sau test (cascade delete scenes)."""
        novel = codex_service.create_novel(
            user_id=_E2E_USER_ID, title="E2E Test Scenes Novel"
        )
        yield novel
        client = codex_service._get_client()
        client.table("novels").delete().eq("id", novel["id"]).execute()

    def _get_first_beat_id(self, novel_id):
        """Init beats + trả id của beat đầu tiên (beat_number=1).

        Args:
            novel_id: UUID của novel cần init beats.

        Returns:
            UUID của beat đầu tiên (beat_number=1).
        """
        beats = codex_service.init_beats(
            novel_id=novel_id, beat_names=agent.SAVE_THE_CAT_BEATS
        )
        return beats[0]["id"]

    def test_e2e_create_and_list_scenes(self, test_novel):
        """create_scene 2 scenes → list_scenes trả 2, ordered by scene_number."""
        beat_id = self._get_first_beat_id(test_novel["id"])
        s1 = codex_service.create_scene(
            novel_id=test_novel["id"],
            beat_id=beat_id,
            title="Scene 1",
            summary="Summary 1",
            user_id=_E2E_USER_ID,
        )
        assert s1["scene_number"] == 1
        s2 = codex_service.create_scene(
            novel_id=test_novel["id"],
            beat_id=beat_id,
            title="Scene 2",
            summary="Summary 2",
            user_id=_E2E_USER_ID,
        )
        assert s2["scene_number"] == 2
        listed = codex_service.list_scenes(
            novel_id=test_novel["id"], user_id=_E2E_USER_ID
        )
        assert len(listed) == 2
        assert listed[0]["scene_number"] == 1
        assert listed[0]["title"] == "Scene 1"
        assert listed[1]["scene_number"] == 2
        assert listed[0]["status"] == "empty"

    def test_e2e_update_scene(self, test_novel):
        """update_scene sửa title + summary → list_scenes verify."""
        beat_id = self._get_first_beat_id(test_novel["id"])
        scene = codex_service.create_scene(
            novel_id=test_novel["id"],
            beat_id=beat_id,
            title="Old",
            summary="Old sum",
            user_id=_E2E_USER_ID,
        )
        updated = codex_service.update_scene(
            scene_id=scene["id"],
            title="New Title",
            summary="New sum",
            user_id=_E2E_USER_ID,
        )
        assert updated["title"] == "New Title"
        assert updated["summary"] == "New sum"
        listed = codex_service.list_scenes(
            novel_id=test_novel["id"], user_id=_E2E_USER_ID
        )
        assert listed[0]["title"] == "New Title"

    def test_e2e_list_scenes_wrong_user_returns_empty(self, test_novel):
        """list_scenes với wrong user_id → empty list (ownership enforced)."""
        beat_id = self._get_first_beat_id(test_novel["id"])
        codex_service.create_scene(
            novel_id=test_novel["id"],
            beat_id=beat_id,
            title="S1",
            summary=None,
            user_id=_E2E_USER_ID,
        )
        listed = codex_service.list_scenes(
            novel_id=test_novel["id"],
            user_id="00000000-0000-0000-0000-000000000000",
        )
        assert listed == []

    def test_e2e_create_scene_wrong_user_returns_none(self, test_novel):
        """create_scene với wrong user_id → None (ownership enforced)."""
        beat_id = self._get_first_beat_id(test_novel["id"])
        result = codex_service.create_scene(
            novel_id=test_novel["id"],
            beat_id=beat_id,
            title="S1",
            summary=None,
            user_id="00000000-0000-0000-0000-000000000000",
        )
        assert result is None

    def test_e2e_update_scene_wrong_user_returns_none(self, test_novel):
        """update_scene với wrong user_id → None (ownership enforced)."""
        beat_id = self._get_first_beat_id(test_novel["id"])
        scene = codex_service.create_scene(
            novel_id=test_novel["id"],
            beat_id=beat_id,
            title="T",
            summary=None,
            user_id=_E2E_USER_ID,
        )
        result = codex_service.update_scene(
            scene_id=scene["id"],
            title="hack",
            summary="hack",
            user_id="00000000-0000-0000-0000-000000000000",
        )
        assert result is None
