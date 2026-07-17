"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

import { listChapters, type Chapter } from "@/lib/chapters";
import {
  resumeWrite,
  streamWrite,
  type AgentMessage,
  type HitlInterrupt,
  type WriteComplete,
} from "@/lib/write";

/** Manuscript file từ /api/novels/[id]/manuscript (path + prose content). */
interface ManuscriptFile {
  path: string;
  content: string;
}

/** View state cho editor panel — quyết định hiển thị gì. */
type EditorView = "chapters" | "proposed" | "reader";

/**
 * Writing tab — 2-panel layout (editor center + chat right).
 *
 * Chat panel (right, 320px cố định): message list + input + HITL approve/reject.
 * Editor panel (center, flex-1): chapter list (mặc định) / proposed prose (HITL)
 * / chapter reader (click chapter).
 *
 * Flow: user chat → streamWrite → agent responds → HITL interrupt → proposed
 * prose in editor + approve/reject in chat → resumeWrite (approve/reject) →
 * complete → refresh chapter list.
 */
export default function WritingTab() {
  const params = useParams<{ id: string }>();
  const novelId = params.id;

  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [interrupt, setInterrupt] = useState<HitlInterrupt | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [proposedProse, setProposedProse] = useState<string | null>(null);
  const [manuscriptFiles, setManuscriptFiles] = useState<ManuscriptFile[]>([]);
  const [view, setView] = useState<EditorView>("chapters");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  /** Refresh chapter list từ Supabase. */
  const refreshChapters = useCallback(async () => {
    try {
      setChapters(await listChapters(novelId));
    } catch {
      // Non-fatal — chapter list có thể rỗng
    }
  }, [novelId]);

  // Load chapters + manuscript files on mount (inline để tránh set-state-in-effect lint)
  useEffect(() => {
    if (!novelId) return;
    let cancelled = false;
    void listChapters(novelId)
      .then((list) => {
        if (!cancelled) setChapters(list);
      })
      .catch(() => {});
    void fetch(`/api/novels/${novelId}/manuscript`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled)
          setManuscriptFiles((data.files as ManuscriptFile[]) ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [novelId]);

  // Auto-scroll to bottom khi messages thay đổi
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /** Gửi tin nhắn — start agent stream. */
  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    setInput("");
    setError(null);
    setProposedProse(null);
    setMessages((prev) => [
      ...prev,
      { role: "human", content: trimmed },
    ]);
    setIsStreaming(true);

    await streamWrite(novelId, trimmed, undefined, {
      onMetadata: (meta) => setThreadId(meta.threadId),
      onState: (msgs) => setMessages(msgs),
      onInterrupt: (intr) => {
        setInterrupt(intr);
        setProposedProse(intr.content);
        setView("proposed");
        setIsStreaming(false);
      },
      onComplete: (result: WriteComplete) => {
        setIsStreaming(false);
        setInterrupt(null);
        setProposedProse(null);
        void refreshChapters();
        if (result.chapterId) setView("chapters");
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
        void refreshChapters();
        setView("chapters");
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
        setView("chapters");
      },
      onError: (err) => {
        setError(err);
        setIsStreaming(false);
      },
    });
  }

  /** Chọn chapter để đọc prose. */
  function handleSelectChapter(chapter: Chapter) {
    setSelectedChapter(chapter);
    setView("reader");
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
      <EditorPanel
        view={view}
        chapters={chapters}
        selectedChapter={selectedChapter}
        proposedProse={proposedProse}
        manuscriptFiles={manuscriptFiles}
        onSelectChapter={handleSelectChapter}
        onBackToList={() => setView("chapters")}
      />
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

// ===== Editor Panel =====

interface EditorPanelProps {
  view: EditorView;
  chapters: Chapter[];
  selectedChapter: Chapter | null;
  proposedProse: string | null;
  manuscriptFiles: ManuscriptFile[];
  onSelectChapter: (chapter: Chapter) => void;
  onBackToList: () => void;
}

/**
 * Editor panel (center) — hiển thị chapter list / proposed prose / chapter reader.
 *
 * @param view - Trạng thái hiển thị: 'chapters' | 'proposed' | 'reader'.
 */
function EditorPanel({
  view,
  chapters,
  selectedChapter,
  proposedProse,
  manuscriptFiles,
  onSelectChapter,
  onBackToList,
}: EditorPanelProps) {
  if (view === "proposed" && proposedProse !== null) {
    return (
      <div className="rounded-lg border border-vermilion/30 bg-vermilion/5 p-6">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-vermilion dark:text-terracotta">
            Nội dung đề xuất
          </p>
          <button
            type="button"
            onClick={onBackToList}
            className="text-xs text-muted transition-colors hover:text-ink"
          >
            ← Quay lại
          </button>
        </div>
        <div className="max-w-prose whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-ink">
          {proposedProse}
        </div>
      </div>
    );
  }

  if (view === "reader" && selectedChapter) {
    const prose = findChapterProse(selectedChapter, manuscriptFiles);
    return (
      <div className="rounded-lg border border-line bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="font-mono text-xs text-muted">
              Chương {selectedChapter.number}
            </p>
            <h2 className="mt-0.5 font-serif text-xl font-semibold text-ink">
              {selectedChapter.title ?? "Chưa đặt tên"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onBackToList}
            className="text-xs text-muted transition-colors hover:text-ink"
          >
            ← Quay lại
          </button>
        </div>
        <div className="mb-4 flex gap-3 text-xs text-muted">
          <span className="rounded-full border border-line px-2 py-0.5">
            {statusLabel(selectedChapter.status)}
          </span>
          <span className="font-mono">{selectedChapter.word_count} từ</span>
        </div>
        {prose ? (
          <div className="max-w-prose whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-ink">
            {prose}
          </div>
        ) : (
          <p className="text-sm italic text-muted">
            Nội dung prose chưa tải được.
          </p>
        )}
      </div>
    );
  }

  // Default: chapter list
  return (
    <div className="rounded-lg border border-line bg-surface p-6">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-vermilion dark:text-terracotta">
          Chương
        </p>
        <h2 className="mt-0.5 font-serif text-xl font-semibold text-ink">
          Danh sách chương
        </h2>
      </div>
      {chapters.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          Chưa có chương. Chat với agent để bắt đầu viết.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {chapters.map((chapter) => (
            <li key={chapter.id}>
              <button
                type="button"
                onClick={() => onSelectChapter(chapter)}
                className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-surface-2"
              >
                <span className="font-mono text-sm text-vermilion dark:text-terracotta">
                  {String(chapter.number).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-serif text-[15px] text-ink">
                    {chapter.title ?? "Chưa đặt tên"}
                  </p>
                </div>
                <span
                  className={`h-2 w-2 flex-none rounded-full ${statusDotClass(chapter.status)}`}
                  aria-label={statusLabel(chapter.status)}
                />
                <span className="font-mono text-xs text-muted">
                  {chapter.word_count}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ===== Chat Panel =====

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
 * Chat panel (right, 320px) — message list + input + HITL approve/reject.
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
            Chat với agent để viết chapter. Ví dụ: &ldquo;viết chương 1 theo beat 8&rdquo;.
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
          <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-vermilion dark:bg-terracotta align-middle" />
        )}
      </div>
    </div>
  );
}

// ===== Helpers =====

/**
 * Tìm prose content cho chapter từ manuscript files (best-effort match).
 *
 * @param chapter - Chapter metadata.
 * @param files - Manuscript files từ store.
 * @returns Prose text hoặc null.
 */
function findChapterProse(
  chapter: Chapter,
  files: ManuscriptFile[],
): string | null {
  const match = files.find(
    (f) =>
      f.path.includes(`chapter_${chapter.number}`) ||
      f.path.includes(`ch-${chapter.number}`) ||
      f.path.includes(`${chapter.number}.md`),
  );
  return match?.content ?? null;
}

/**
 * Trả class CSS cho dot trạng thái chapter.
 *
 * @param status - Chapter status ('draft' | 'revised' | 'final').
 * @returns Tailwind class string.
 */
function statusDotClass(status: string): string {
  if (status === "final") return "bg-sage";
  if (status === "revised") return "bg-vermilion dark:bg-terracotta";
  return "border border-muted";
}

/**
 * Trả nhãn tiếng Việt cho chapter status.
 *
 * @param status - Chapter status.
 * @returns Nhãn hiển thị.
 */
function statusLabel(status: string): string {
  if (status === "final") return "Hoàn thành";
  if (status === "revised") return "Đã sửa";
  return "Bản nháp";
}
