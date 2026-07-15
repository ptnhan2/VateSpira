"""Tests cho StoreBackend namespace factory functions (multi-tenant, ADR-008).

Namespace factory (_manuscript_namespace, _memories_namespace) scope
manuscript/memory files theo user_id + novel_id. _namespace_context_value
helper đọc runtime context graceful (không raise) — khác _get_user_id
(security boundary cho codex tools). Tests cover dict/attr context,
context None, runtime unavailable, missing key, empty value, fallbacks
(user_id -> 'default', novel_id -> 'draft'), và CompositeBackend wiring.
"""

from types import SimpleNamespace

import agent


# --- Helpers ---


class _UnavailableRuntime:
    """Runtime mock nơi truy cập .context raise AttributeError.

    Mô phỏng _NamespaceRuntimeCompat khi runtime=None (chạy ngoài graph
    execution) — __getattr__ raise AttributeError 'Runtime is not available'.

    Note:
        Dùng property để raise khi truy cập, giống hành vi thật của wrapper.
    """

    @property
    def context(self):  # type: ignore[override]
        raise AttributeError("Runtime is not available")


def _dict_runtime(user_id=None, novel_id=None):
    """Tạo runtime mock với context là dict chứa user_id/novel_id.

    Args:
        user_id: Giá trị user_id (None = không có key).
        novel_id: Giá trị novel_id (None = không có key).

    Returns:
        SimpleNamespace có attribute .context là dict.
    """
    ctx = {}
    if user_id is not None:
        ctx["user_id"] = user_id
    if novel_id is not None:
        ctx["novel_id"] = novel_id
    return SimpleNamespace(context=ctx)


def _attr_runtime(user_id=None, novel_id=None):
    """Tạo runtime mock với context là object (attr access) user_id/novel_id.

    Args:
        user_id: Giá trị user_id (None = không set attr).
        novel_id: Giá trị novel_id (None = không set attr).

    Returns:
        SimpleNamespace có attribute .context là SimpleNamespace.
    """
    ctx = SimpleNamespace()
    if user_id is not None:
        ctx.user_id = user_id
    if novel_id is not None:
        ctx.novel_id = novel_id
    return SimpleNamespace(context=ctx)


# --- _namespace_context_value ---


def test_namespace_context_value_reads_dict_context():
    """_namespace_context_value đọc user_id từ dict context."""
    rt = _dict_runtime(user_id="user-abc")
    assert agent._namespace_context_value(rt, "user_id", "default") == "user-abc"


def test_namespace_context_value_reads_attr_context():
    """_namespace_context_value đọc novel_id từ attr (object) context."""
    rt = _attr_runtime(novel_id="novel-xyz")
    assert agent._namespace_context_value(rt, "novel_id", "draft") == "novel-xyz"


def test_namespace_context_value_returns_default_when_context_none():
    """_namespace_context_value trả default khi context là None."""
    rt = SimpleNamespace(context=None)
    assert agent._namespace_context_value(rt, "user_id", "default") == "default"


def test_namespace_context_value_returns_default_when_runtime_unavailable():
    """_namespace_context_value trả default khi rt.context raise AttributeError."""
    rt = _UnavailableRuntime()
    assert agent._namespace_context_value(rt, "user_id", "default") == "default"


def test_namespace_context_value_returns_default_when_key_missing():
    """_namespace_context_value trả default khi key thiếu trong context."""
    rt = _dict_runtime(user_id="u1")  # no novel_id
    assert agent._namespace_context_value(rt, "novel_id", "draft") == "draft"


def test_namespace_context_value_returns_default_when_value_empty():
    """_namespace_context_value trả default khi giá trị là chuỗi rỗng."""
    rt = _dict_runtime(user_id="")
    assert agent._namespace_context_value(rt, "user_id", "default") == "default"


# --- _manuscript_namespace ---


def test_manuscript_namespace_full_context():
    """_manuscript_namespace trả (user_id, 'novels', novel_id) khi đủ context."""
    rt = _dict_runtime(user_id="user-1", novel_id="novel-1")
    assert agent._manuscript_namespace(rt) == ("user-1", "novels", "novel-1")


def test_manuscript_namespace_fallback_novel_id_draft():
    """_manuscript_namespace fallback novel_id='draft' khi thiếu novel_id."""
    rt = _dict_runtime(user_id="user-1")  # no novel_id
    assert agent._manuscript_namespace(rt) == ("user-1", "novels", "draft")


def test_manuscript_namespace_fallback_user_id_default():
    """_manuscript_namespace fallback user_id='default' khi thiếu user_id."""
    rt = _dict_runtime(novel_id="novel-1")  # no user_id
    assert agent._manuscript_namespace(rt) == ("default", "novels", "novel-1")


def test_manuscript_namespace_both_missing():
    """_manuscript_namespace fallback cả hai khi context rỗng."""
    rt = _dict_runtime()  # empty context
    assert agent._manuscript_namespace(rt) == ("default", "novels", "draft")


# --- _memories_namespace ---


def test_memories_namespace_full_context():
    """_memories_namespace trả (user_id, 'memories') khi có user_id."""
    rt = _attr_runtime(user_id="user-1")
    assert agent._memories_namespace(rt) == ("user-1", "memories")


def test_memories_namespace_fallback_user_id_default():
    """_memories_namespace fallback user_id='default' khi thiếu user_id."""
    rt = _attr_runtime()  # no user_id
    assert agent._memories_namespace(rt) == ("default", "memories")


# --- Wiring ---


def test_wiring_manuscript_and_memories_namespaced_skills_global():
    """CompositeBackend: manuscript/memories namespaced, skills global."""
    routes = agent.backend.routes
    assert routes["/manuscript/"]._namespace is agent._manuscript_namespace
    assert routes["/memories/"]._namespace is agent._memories_namespace
    assert routes["/skills/"]._namespace is None
