"use client";

import { useState } from "react";
import { deriveStatus } from "@/lib/beats";
import { updateScene, type Scene } from "@/lib/scenes";

/**
 * Một scene card — tiêu đề + tóm tắt + dàn ý editable, auto-save on blur.
 *
 * Cùng pattern BeatSlot: state local cho title + summary + outline, isDirty
 * track chỉnh sửa chưa lưu, handleBlur gọi updateScene khi có thay đổi.
 * Nút "Viết chương" hiện khi outline có nội dung → onWriteChapter callback.
 *
 * @param scene - Scene từ DB (kèm id, scene_number, title, summary, outline).
 * @param onSaved - Callback khi lưu xong — cập nhật state ở parent.
 * @param onWriteChapter - Callback khi click "Viết chương" — trigger agent stream.
 */
export default function SceneCard({
  scene,
  onSaved,
  onWriteChapter,
}: {
  scene: Scene;
  onSaved: (saved: Scene) => void;
  onWriteChapter: (scene: Scene) => void;
}) {
  const [title, setTitle] = useState(scene.title);
  const [summary, setSummary] = useState(scene.summary);
  const [outline, setOutline] = useState(scene.outline ?? "");
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isOutlineExpanded, setIsOutlineExpanded] = useState(false);

  /**
   * Lưu scene on blur: gọi updateScene với title + summary + outline hiện tại.
   * Bỏ qua khi không có thay đổi (isDirty false).
   */
  async function handleBlur() {
    if (!isDirty) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const saved = await updateScene(scene.id, title, summary, outline);
      setIsDirty(false);
      onSaved(saved);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Không thể lưu scene.");
    } finally {
      setIsSaving(false);
    }
  }

  const hasContent = title.trim() !== "" || summary.trim() !== "";
  const hasOutline = outline.trim() !== "";
  const status = deriveStatus(
    hasContent ? title.trim() || summary : null,
    isDirty,
  );
  const dotClass =
    status === "filled"
      ? "bg-sage"
      : status === "draft"
        ? "bg-vermilion"
        : "border border-muted";

  return (
    <div
      data-testid={`scene-${scene.id}`}
      className="border-b border-line py-3 last:border-b-0"
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="font-mono text-[11px] text-muted">
          {scene.scene_number}
        </span>
        <span
          data-status={status}
          className={`h-2 w-2 rounded-full ${dotClass}`}
          aria-label={`trạng thái: ${status}`}
        />
        <input
          aria-label={`Tiêu đề scene ${scene.scene_number}`}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setIsDirty(true);
          }}
          onBlur={handleBlur}
          placeholder="Tiêu đề scene…"
          className="flex-1 border-b border-transparent bg-transparent font-serif text-[15px] font-medium text-ink outline-none transition-colors focus:border-vermilion dark:focus:border-terracotta"
        />
      </div>
      <textarea
        aria-label={`Tóm tắt scene ${scene.scene_number}`}
        value={summary}
        onChange={(e) => {
          setSummary(e.target.value);
          setIsDirty(true);
        }}
        onBlur={handleBlur}
        placeholder="Viết tóm tắt scene…"
        className="w-full resize-y bg-transparent font-serif text-[14px] leading-relaxed text-ink-2 outline-none"
      />

      {/* Outline toggle */}
      <button
        type="button"
        onClick={() => setIsOutlineExpanded(!isOutlineExpanded)}
        className="mt-1 text-xs text-muted transition-colors hover:text-vermilion dark:hover:text-terracotta"
      >
        {isOutlineExpanded ? "▼ Thu gọn dàn ý" : "▶ Dàn ý chi tiết"}
        {hasOutline && <span className="ml-1 text-sage">●</span>}
      </button>

      {isOutlineExpanded && (
        <textarea
          aria-label={`Dàn ý scene ${scene.scene_number}`}
          value={outline}
          onChange={(e) => {
            setOutline(e.target.value);
            setIsDirty(true);
          }}
          onBlur={handleBlur}
          placeholder="Viết dàn ý chi tiết — tình tiết tuần tự, dialogue markers, chuyển cảnh…"
          rows={5}
          className="mt-1 w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 font-serif text-[14px] leading-relaxed text-ink-2 outline-none transition-colors focus:border-vermilion dark:focus:border-terracotta"
        />
      )}

      {/* Viết chương button — chỉ hiện khi có outline */}
      {hasOutline && (
        <button
          type="button"
          data-testid={`write-chapter-${scene.id}`}
          onClick={() => onWriteChapter({ ...scene, title, summary, outline })}
          className="mt-2 rounded-lg bg-vermilion px-3 py-1.5 text-xs font-medium text-cream transition-colors hover:opacity-90 dark:bg-terracotta"
        >
          Viết chương
        </button>
      )}

      {isSaving && <p className="mt-1 text-xs text-muted">đang lưu…</p>}
      {saveError && (
        <p className="mt-1 text-xs text-vermilion dark:text-terracotta">
          {saveError}
        </p>
      )}
    </div>
  );
}
