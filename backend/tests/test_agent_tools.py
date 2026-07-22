"""Tests cho agent @tool functions (create_novel, list_novels, get_novel).

Mock codex_service functions qua patch.object(agent.codex_service, ...).
Mock backend qua patch.object(agent, "backend", ...) cho scaffold tests.
ToolRuntime constructed qua _make_runtime helper. Tools called qua .func()
để bypass tool invocation machinery và test logic trực tiếp.
"""

import json
from unittest.mock import MagicMock, patch

import pytest
from langchain_core.tools import BaseTool
from langgraph.prebuilt import ToolRuntime

import agent


@pytest.fixture(autouse=True)
def _mock_init_beats():
    """Mock init_beats cho tất cả tests.

    create_novel tool giờ gọi codex_service.init_beats (best-effort).
    Nếu không mock → test sẽ gọi real Supabase (slow + network I/O).
    Mock return [] cho tất cả tests; test_beats.py verify init_beats riêng.
    """
    with patch.object(agent.codex_service, "init_beats", return_value=[]):
        yield


# --- Helpers ---

def _make_runtime(user_id=None, novel_id=None):
    """Tạo ToolRuntime mock với context chứa user_id + novel_id.

    Args:
        user_id: Giá trị user_id trong context (None = context None).
        novel_id: Giá trị novel_id trong context (mặc định None).

    Returns:
        ToolRuntime instance với context dict hoặc None.
    """
    if user_id is None and novel_id is None:
        return ToolRuntime(
            state=None,
            context=None,
            config={},
            stream_writer=None,
            tool_call_id="test-call",
            store=None,
        )
    ctx = {}
    if user_id is not None:
        ctx["user_id"] = user_id
    if novel_id is not None:
        ctx["novel_id"] = novel_id
    return ToolRuntime(
        state=None,
        context=ctx,
        config={},
        stream_writer=None,
        tool_call_id="test-call",
        store=None,
    )


def _make_write_ok():
    """Tạo mock WriteResult thành công (error=None)."""
    return MagicMock(error=None, path="/mock")


# --- create_novel tool ---

def test_create_novel_extracts_user_id_and_calls_service():
    """create_novel tool trích xuất user_id từ runtime, gọi codex_service."""
    rt = _make_runtime(user_id="user-123")
    with (
        patch.object(agent.codex_service, "create_novel", return_value={"id": "n1", "title": "T"}) as mock_fn,
        patch.object(agent, "backend"),
    ):
        result = agent.create_novel.func(title="T", runtime=rt)
    parsed = json.loads(result)
    assert parsed["id"] == "n1"
    mock_fn.assert_called_once()
    assert mock_fn.call_args.kwargs["user_id"] == "user-123"
    assert mock_fn.call_args.kwargs["title"] == "T"


def test_create_novel_passes_optional_fields():
    """create_novel tool truyền language, pov, tense, technique đúng."""
    rt = _make_runtime(user_id="u1")
    with (
        patch.object(agent.codex_service, "create_novel", return_value={"id": "n1"}) as mock_fn,
        patch.object(agent, "backend"),
    ):
        agent.create_novel.func(
            title="T", runtime=rt, language="en", pov="first", tense="past"
        )
    kwargs = mock_fn.call_args.kwargs
    assert kwargs["language"] == "en"
    assert kwargs["pov"] == "first"
    assert kwargs["tense"] == "past"
    assert kwargs["technique"] == "save-the-cat"


def test_create_novel_converts_empty_pov_tense_to_none():
    """create_novel tool chuyển pov/tense rỗng thành None (DB nullable)."""
    rt = _make_runtime(user_id="u1")
    with (
        patch.object(agent.codex_service, "create_novel", return_value={"id": "n1"}) as mock_fn,
        patch.object(agent, "backend"),
    ):
        agent.create_novel.func(title="T", runtime=rt, pov="", tense="")
    kwargs = mock_fn.call_args.kwargs
    assert kwargs["pov"] is None
    assert kwargs["tense"] is None


def test_create_novel_raises_without_user_id():
    """create_novel tool raises ValueError khi context None, service NOT called."""
    rt = _make_runtime(user_id=None)
    with (
        patch.object(agent.codex_service, "create_novel") as mock_fn,
        patch.object(agent, "backend"),
    ):
        with pytest.raises(ValueError, match="user_id"):
            agent.create_novel.func(title="T", runtime=rt)
    mock_fn.assert_not_called()


def test_create_novel_scaffolds_manuscript_and_memory():
    """create_novel tool scaffold /manuscript/outline.md + /memories/novel-bible.md."""
    rt = _make_runtime(user_id="u1")
    mock_backend = MagicMock()
    mock_backend.write.return_value = _make_write_ok()
    with patch.object(agent.codex_service, "create_novel", return_value={"id": "n1", "title": "T"}):
        with patch.object(agent, "backend", mock_backend):
            agent.create_novel.func(title="T", runtime=rt)
    write_calls = mock_backend.write.call_args_list
    paths = [c[0][0] for c in write_calls]
    assert "/manuscript/outline.md" in paths
    assert "/memories/novel-bible.md" in paths


def test_create_novel_scaffold_uses_title_in_content():
    """create_novel tool scaffold content chứa novel title."""
    rt = _make_runtime(user_id="u1")
    mock_backend = MagicMock()
    mock_backend.write.return_value = _make_write_ok()
    with patch.object(agent.codex_service, "create_novel", return_value={"id": "n1", "title": "MyNovel"}):
        with patch.object(agent, "backend", mock_backend):
            agent.create_novel.func(title="MyNovel", runtime=rt)
    contents = [c[0][1] for c in mock_backend.write.call_args_list]
    assert any("MyNovel" in c for c in contents)


def test_create_novel_passes_genre_to_service():
    """create_novel tool truyền genre cho codex_service khi được cung cấp."""
    rt = _make_runtime(user_id="u1")
    with (
        patch.object(agent.codex_service, "create_novel", return_value={"id": "n1"}) as mock_fn,
        patch.object(agent, "backend"),
    ):
        agent.create_novel.func(title="T", runtime=rt, genre="fantasy")
    assert mock_fn.call_args.kwargs["genre"] == "fantasy"


def test_create_novel_converts_empty_genre_to_none():
    """create_novel tool chuyển genre rỗng thành None (DB nullable)."""
    rt = _make_runtime(user_id="u1")
    with (
        patch.object(agent.codex_service, "create_novel", return_value={"id": "n1"}) as mock_fn,
        patch.object(agent, "backend"),
    ):
        agent.create_novel.func(title="T", runtime=rt, genre="")
    assert mock_fn.call_args.kwargs["genre"] is None


# --- list_novels tool ---

def test_list_novels_returns_json_list():
    """list_novels tool trả về JSON list, service called with user_id."""
    rt = _make_runtime(user_id="u1")
    with patch.object(agent.codex_service, "list_novels", return_value=[{"id": "n1"}, {"id": "n2"}]) as mock_fn:
        result = agent.list_novels.func(runtime=rt)
    parsed = json.loads(result)
    assert len(parsed) == 2
    mock_fn.assert_called_once_with(user_id="u1")


def test_list_novels_raises_without_user_id():
    """list_novels tool raises ValueError khi no user_id."""
    rt = _make_runtime(user_id=None)
    with patch.object(agent.codex_service, "list_novels") as mock_fn:
        with pytest.raises(ValueError, match="user_id"):
            agent.list_novels.func(runtime=rt)
    mock_fn.assert_not_called()


# --- get_novel tool ---

def test_get_novel_returns_record_json():
    """get_novel tool trả về JSON record khi tìm thấy (novel_id từ context)."""
    rt = _make_runtime(user_id="u1", novel_id="n1")
    with patch.object(agent.codex_service, "get_novel", return_value={"id": "n1", "title": "T"}) as mock_fn:
        result = agent.get_novel.func(runtime=rt)
    parsed = json.loads(result)
    assert parsed["id"] == "n1"
    mock_fn.assert_called_once_with(novel_id="n1", user_id="u1")


def test_get_novel_returns_error_json_when_not_found():
    """get_novel tool trả về JSON error khi novel không tìm thấy."""
    rt = _make_runtime(user_id="u1", novel_id="n1")
    with patch.object(agent.codex_service, "get_novel", return_value=None):
        result = agent.get_novel.func(runtime=rt)
    parsed = json.loads(result)
    assert "error" in parsed
    assert "n1" in parsed["error"]


def test_get_novel_raises_without_user_id():
    """get_novel tool raises ValueError khi no user_id."""
    rt = _make_runtime(user_id=None)
    with patch.object(agent.codex_service, "get_novel") as mock_fn:
        with pytest.raises(ValueError, match="user_id"):
            agent.get_novel.func(runtime=rt)
    mock_fn.assert_not_called()


def test_get_novel_raises_without_novel_id():
    """get_novel tool raises ValueError khi no novel_id trong context."""
    rt = _make_runtime(user_id="u1", novel_id=None)
    with patch.object(agent.codex_service, "get_novel") as mock_fn:
        with pytest.raises(ValueError, match="novel_id"):
            agent.get_novel.func(runtime=rt)
    mock_fn.assert_not_called()


# --- tools wiring ---

def test_all_ten_tools_are_base_tool_instances():
    """10 tools (create_novel, list_novels, get_novel, list_beats, update_beat,
    list_scenes, create_scene, update_scene, save_chapter_metadata, list_chapters)
    là BaseTool."""
    assert isinstance(agent.create_novel, BaseTool)
    assert isinstance(agent.list_novels, BaseTool)
    assert isinstance(agent.get_novel, BaseTool)
    assert isinstance(agent.list_beats, BaseTool)
    assert isinstance(agent.update_beat, BaseTool)
    assert isinstance(agent.list_scenes, BaseTool)
    assert isinstance(agent.create_scene, BaseTool)
    assert isinstance(agent.update_scene, BaseTool)
    assert isinstance(agent.save_chapter_metadata, BaseTool)
    assert isinstance(agent.list_chapters, BaseTool)
