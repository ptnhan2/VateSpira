"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

import PlotContent from "./plot-content";
import {
  resumeWrite,
  streamWrite,
  type AgentMessage,
  type HitlInterrupt,
  type WriteComplete,
} from "@/lib/write";
import type { Scene } from "@/lib/scenes";
import type { Chapter } from "@/lib/chapters";
import { updateChapterWordCount } from "@/lib/chapters";

/** View state cho center panel — Plot (mặc định), Editor (khi đang viết), Reader (khi đọc chapter). */
type CenterView = "plot" | "editor" | "reader";

/**
 * Writing workspace — 2-panel layout: Plot (center) + Chat (right, 320px persistent).
 *
 * Plot là entry point. Mỗi scene card có nút "Viết chương" (khi có outline) →
 * center panel chuyển sang Editor (proposed prose) + chat panel bắt đầu stream
 * agent với scene context. HITL: approve/reject trong chat panel, proposed prose
 * trong editor panel.
 *
 * @param params - Dynamic route params `{ id: string }` (novelId).
 */
export default function WritingWorkspace() {
  const params = useParams<{ id: string }>();
  const novelId = params.id;

  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [interrupt, setInterrupt] = useState<HitlInterrupt | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<CenterView>("plot");
  const [activeScene, setActiveScene] = useState<Scene | null>(null);
  const [proposedProse, setProposedProse] = useState<string | null>(null);
  const [readingChapter, setReadingChapter] = useState<Chapter | null>(null);
  const [chapterProse, setChapterProse] = useState<string | null>(null);
  const [chapterFilePath, setChapterFilePath] = useState<string | null>(null);
  const [plotRefreshKey, setPlotRefreshKey] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /**
   * Xây dựng message cho agent khi click "Viết chương" — include scene context.
   * @param scene - Scene được chọn (có title, summary, outline).
   * @returns Message string cho agent.
   */
  function buildSceneMessage(scene: Scene): string {
    const parts = [`Viết chương cho novel này.`];
    parts.push(`Scene ${scene.scene_number}: ${scene.title || "chưa đặt tên"}.`);
    if (scene.summary) parts.push(`Tóm tắt: ${scene.summary}`);
    if (scene.outline) parts.push(`Dàn ý: ${scene.outline}`);
    parts.push(
      `Dựa vào context novel, beats, scenes, memories, viết prose cho chương này.`,
    );
    return parts.join(" ");
  }

  /** Click "Viết chương" trên scene card — start agent stream với scene context. */
  function handleWriteChapter(scene: Scene) {
    setActiveScene(scene);
    setView("editor");
    setProposedProse(null);
    setError(null);
    setMessages([{ role: "human", content: buildSceneMessage(scene) }]);
    setIsStreaming(true);

    void streamWrite(novelId, buildSceneMessage(scene), undefined, {
      onMetadata: (meta) => setThreadId(meta.threadId),
      onState: (msgs) => setMessages(msgs),
      onInterrupt: (intr) => {
        setInterrupt(intr);
        setProposedProse(intr.content);
        setIsStreaming(false);
      },
      onComplete: (result: WriteComplete) => {
        setIsStreaming(false);
        setInterrupt(null);
        setProposedProse(null);
        setPlotRefreshKey((k) => k + 1);
        if (result.chapterId) setView("plot");
      },
      onError: (err) => {
        setError(err);
        setIsStreaming(false);
      },
    });
  }

  /** Đóng editor → về Plot view. */
  function handleCloseEditor() {
    setView("plot");
    setProposedProse(null);
    setActiveScene(null);
  }

  /** Click "Sửa chương" trên scene → mở reader cho chapter đã có. */
  function handleEditChapter(scene: Scene) {
    // Tìm chapter matching scene_number (best-effort match)
    void fetch(`/api/novels/${novelId}/manuscript`)
      .then((res) => res.json())
      .then((data) => {
        const files = (data.files as Array<{ path: string; content: string }>) ?? [];
        const match = files.find(
          (f) =>
            f.path.includes(`chapter_${scene.scene_number}`) ||
            f.path.includes(`ch-${scene.scene_number}`) ||
            f.path.includes(`${scene.scene_number}.md`),
        );
        setReadingChapter({
          id: scene.id,
          novel_id: novelId,
          number: scene.scene_number,
          title: scene.title,
          status: "draft",
          word_count: 0,
          created_at: "",
          updated_at: "",
        });
        setChapterFilePath(match?.path ?? null);
        setChapterProse(match?.content ?? null);
        setView("reader");
      })
      .catch(() => {
        setReadingChapter(null);
        setChapterProse(null);
      });
  }

  /** Đóng reader → về Plot view. */
  function handleCloseReader() {
    setView("plot");
    setReadingChapter(null);
    setChapterProse(null);
    setChapterFilePath(null);
  }

  /** Lưu prose đã sửa → PUT manuscript route + update word_count. */
  async function handleSaveProse(newContent: string) {
    if (!chapterFilePath || !readingChapter) return;
    try {
      await fetch(`/api/novels/${novelId}/manuscript`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: chapterFilePath, content: newContent }),
      });
      await updateChapterWordCount(readingChapter.id, newContent);
      setChapterProse(newContent);
      setReadingChapter({ ...readingChapter, word_count: newContent.trim() ? newContent.trim().split(/\s+/).length : 0 });
    } catch {
      // Non-fatal — prose saved to StoreBackend, word_count update failed
    }
  }

  /** Gửi tin nhắn chat (khi không trong editing flow). */
  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { role: "human", content: trimmed }]);
    setIsStreaming(true);

    await streamWrite(novelId, trimmed, undefined, {
      onMetadata: (meta) => setThreadId(meta.threadId),
      onState: (msgs) => setMessages(msgs),
      onInterrupt: (intr) => {
        setInterrupt(intr);
        setProposedProse(intr.content);
        setIsStreaming(false);
      },
      onComplete: () => {
        setIsStreaming(false);
        setInterrupt(null);
        setProposedProse(null);
      },
      onError: (err) => {
        setError(err);
        setIsStreaming(false);
      },
    });
  }

  /** Duyệt HITL — resume agent với approve. */
  async function handleApprove() {
    if (!threadId || !interrupt) return;
    setIsStreaming(true);
    setInterrupt(null);

    await resumeWrite(novelId, threadId, "approve", undefined, {
      onState: (msgs) => setMessages(msgs),
      onComplete: () => {
        setIsStreaming(false);
        setProposedProse(null);
        setPlotRefreshKey((k) => k + 1);
        setView("plot");
      },
      onError: (err) => {
        setError(err);
        setIsStreaming(false);
      },
    });
  }

  /** Từ chối HITL — resume agent với reject. */
  async function handleReject() {
    if (!threadId || !interrupt) return;
    setIsStreaming(true);
    setInterrupt(null);

    await resumeWrite(novelId, threadId, "reject", undefined, {
      onState: (msgs) => setMessages(msgs),
      onComplete: () => {
        setIsStreaming(false);
        setProposedProse(null);
      },
      onError: (err) => {
        setError(err);
        setIsStreaming(false);
      },
    });
  }

  /** Enter để gửi, Shift+Enter để xuống dòng. */
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <div className="flex flex-col gap-4 md:grid md:grid-cols-[1fr_320px] md:gap-6">
      {/* Center panel: Plot (always mounted, hidden when not active), Editor, Reader */}
      <div className={view === "plot" ? "" : "hidden"}>
        <PlotContent
          novelId={novelId}
          onWriteChapter={handleWriteChapter}
          onEditChapter={handleEditChapter}
          refreshKey={plotRefreshKey}
        />
      </div>
      {view === "editor" && (
        <EditorPanel
          scene={activeScene}
          proposedProse={proposedProse}
          isStreaming={isStreaming}
          onClose={handleCloseEditor}
        />
      )}
      {view === "reader" && (
        <ChapterReader
          chapter={readingChapter}
          prose={chapterProse}
          canEdit={!!chapterFilePath}
          onClose={handleCloseReader}
          onSave={handleSaveProse}
        />
      )}

      {/* Chat panel (right, 320px persistent) */}
      <ChatPanel
        messages={messages}
        input={input}
        isStreaming={isStreaming}
        interrupt={interrupt}
        error={error}
        messagesEndRef={messagesEndRef}
        onInputChange={setInput}
        onKeyDown={handleKeyDown}
        onSend={handleSend}
        onApprove={handleApprove}
        onReject={handleReject}
      />
    </div>
  );
}

// ===== Editor Panel (center — proposed prose khi HITL) =====

interface EditorPanelProps {
  scene: Scene | null;
  proposedProse: string | null;
  isStreaming: boolean;
  onClose: () => void;
}

/**
 * Editor panel — hiển thị proposed prose từ HITL hoặc loading state.
 *
 * @param scene - Scene đang được viết (cho tiêu đề).
 * @param proposedProse - Nội dung prose đề xuất (từ HITL interrupt).
 * @param isStreaming - Agent đang stream (chưa có proposed prose).
 * @param onClose - Callback đóng editor → về Plot view.
 */
function EditorPanel({
  scene,
  proposedProse,
  isStreaming,
  onClose,
}: EditorPanelProps) {
  return (
    <div className="rounded-lg border border-line bg-surface p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-vermilion dark:text-terracotta">
            {proposedProse ? "Nội dung đề xuất" : "Đang viết…"}
          </p>
          {scene && (
            <h2 className="mt-0.5 font-serif text-xl font-semibold text-ink">
              Scene {scene.scene_number}: {scene.title || "Chưa đặt tên"}
            </h2>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted transition-colors hover:text-ink"
        >
          ✕ Đóng
        </button>
      </div>

      {isStreaming && !proposedProse && (
        <p className="py-8 text-center text-sm text-muted">
          Agent đang đọc context và viết prose…
        </p>
      )}

      {proposedProse && (
        <div className="rounded-lg border border-vermilion/30 bg-vermilion/5 p-4">
          <div className="max-w-prose whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-ink">
            {proposedProse}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Chat Panel (right, 320px persistent) =====

interface ChatPanelProps {
  messages: AgentMessage[];
  input: string;
  isStreaming: boolean;
  interrupt: HitlInterrupt | null;
  error: string | null;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSend: () => void;
  onApprove: () => void;
  onReject: () => void;
}

/**
 * Chat panel (right, 320px) — persistent, always visible.
 * Message list + input + HITL approve/reject.
 */
function ChatPanel({
  messages,
  input,
  isStreaming,
  interrupt,
  error,
  messagesEndRef,
  onInputChange,
  onKeyDown,
  onSend,
  onApprove,
  onReject,
}: ChatPanelProps) {
  return (
    <div className="flex h-[400px] flex-col rounded-lg border border-line bg-surface md:h-[600px]">
      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">
            Chat với agent hoặc click &ldquo;Viết chương&rdquo; trên scene để bắt đầu.
          </p>
        )}
        {messages.map((msg, i) => (
          <MessageBubble
            key={i}
            message={msg}
            isStreaming={isStreaming && i === messages.length - 1}
          />
        ))}
        {error && (
          <p className="rounded-lg border border-vermilion/20 bg-vermilion-soft p-3 text-xs text-vermilion dark:text-terracotta">
            {error}
          </p>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* HITL approve/reject */}
      {interrupt && (
        <div className="flex gap-2 border-t border-line p-3">
          <button
            type="button"
            onClick={onApprove}
            className="flex-1 rounded-lg bg-sage px-3 py-2 text-sm font-medium text-cream transition-colors hover:opacity-90"
          >
            Duyệt
          </button>
          <button
            type="button"
            onClick={onReject}
            className="flex-1 rounded-lg border border-line px-3 py-2 text-sm text-muted transition-colors hover:text-ink"
          >
            Từ chối
          </button>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-line p-3">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Viết tin nhắn…"
            rows={2}
            disabled={isStreaming || !!interrupt}
            className="flex-1 resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-vermilion dark:focus:border-terracotta disabled:opacity-50"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={isStreaming || !!interrupt || !input.trim()}
            className="self-end rounded-lg bg-vermilion px-4 py-2 text-sm font-medium text-cream transition-colors hover:opacity-90 disabled:opacity-50 dark:bg-terracotta"
          >
            Gửi
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== Message Bubble =====

interface MessageBubbleProps {
  message: AgentMessage;
  isStreaming: boolean;
}

/**
 * Message bubble — user (right, Inter) / agent (left, Newsreader, cursor blink).
 */
function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  if (message.role === "tool") {
    return (
      <p className="text-center text-xs text-muted">
        ⚙ {message.toolName ?? "tool"}
      </p>
    );
  }

  const isUser = message.role === "human";
  return (
    <div className={isUser ? "text-right" : "text-left"}>
      <div
        className={`inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? "bg-surface-2 font-sans text-ink"
            : "bg-paper font-serif text-[15px] leading-relaxed text-ink"
        }`}
      >
        {message.content}
        {isStreaming && (
          <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-vermilion align-middle dark:bg-terracotta" />
        )}
      </div>
    </div>
  );
}

// ===== Chapter Reader (center — đọc/sửa prose chương đã viết) =====

interface ChapterReaderProps {
  chapter: Chapter | null;
  prose: string | null;
  canEdit: boolean;
  onClose: () => void;
  onSave: (newContent: string) => Promise<void>;
}

/**
 * Chapter reader — hiển thị + chỉnh sửa prose của chương đã viết.
 *
 * Read mode: hiển thị prose (serif, max-w-prose).
 * Edit mode: textarea + nút Lưu/Hủy (khi canEdit=true và có file path).
 *
 * @param chapter - Chapter metadata từ DB.
 * @param prose - Nội dung prose (từ StoreBackend).
 * @param canEdit - Có thể sửa (true khi tìm thấy file path trong StoreBackend).
 * @param onClose - Callback đóng reader → về Plot view.
 * @param onSave - Callback lưu prose đã sửa → PUT manuscript + update word_count.
 */
function ChapterReader({ chapter, prose, canEdit, onClose, onSave }: ChapterReaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /** Bắt đầu sửa — copy prose sang editContent. */
  function handleStartEdit() {
    setEditContent(prose ?? "");
    setSaveError(null);
    setIsEditing(true);
  }

  /** Lưu prose đã sửa. */
  async function handleSave() {
    setIsSaving(true);
    setSaveError(null);
    try {
      await onSave(editContent);
      setIsEditing(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Không thể lưu.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="font-mono text-xs text-muted">
            Chương {chapter?.number ?? "?"}
          </p>
          <h2 className="mt-0.5 font-serif text-xl font-semibold text-ink">
            {chapter?.title ?? "Chưa đặt tên"}
          </h2>
        </div>
        <div className="flex gap-2">
          {!isEditing && canEdit && prose !== null && (
            <button
              type="button"
              onClick={handleStartEdit}
              className="text-xs text-muted transition-colors hover:text-vermilion dark:hover:text-terracotta"
            >
              Sửa
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-muted transition-colors hover:text-ink"
          >
            ✕ Đóng
          </button>
        </div>
      </div>

      <div className="mb-4 flex gap-3 text-xs text-muted">
        <span className="rounded-full border border-line px-2 py-0.5">
          {chapter?.status === "final"
            ? "Hoàn thành"
            : chapter?.status === "revised"
              ? "Đã sửa"
              : "Bản nháp"}
        </span>
        <span className="font-mono">{chapter?.word_count ?? 0} từ</span>
      </div>

      {prose === null && !isEditing ? (
        <p className="py-8 text-center text-sm text-muted">
          Đang tải nội dung chương…
        </p>
      ) : isEditing ? (
        <div>
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={20}
            className="w-full resize-y rounded-lg border border-line bg-paper px-3 py-2 font-serif text-[15px] leading-relaxed text-ink outline-none transition-colors focus:border-vermilion dark:focus:border-terracotta"
          />
          {saveError && (
            <p className="mt-2 text-xs text-vermilion dark:text-terracotta">
              {saveError}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-lg bg-sage px-4 py-2 text-sm font-medium text-cream transition-colors hover:opacity-90 disabled:opacity-50"
            >
              {isSaving ? "Đang lưu…" : "Lưu"}
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              disabled={isSaving}
              className="rounded-lg border border-line px-4 py-2 text-sm text-muted transition-colors hover:text-ink disabled:opacity-50"
            >
              Hủy
            </button>
          </div>
        </div>
      ) : (
        <div className="max-w-prose whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-ink">
          {prose}
        </div>
      )}
    </div>
  );
}
