"use client";

import { useState } from "react";
import { deriveStatus } from "@/lib/beats";
import { updateScene, type Scene } from "@/lib/scenes";

/**
 * Một scene card — tiêu đề + tóm tắt editable, auto-save on blur.
 *
 * Cùng pattern BeatSlot: state local cho title + summary, isDirty track
 * chỉnh sửa chưa lưu, handleBlur gọi updateScene khi có thay đổi.
 * Status dot dùng deriveStatus từ beats.ts (pure function, tái sử dụng).
 *
 * @param scene - Scene từ DB (kèm id, scene_number, title, summary).
 * @param onSaved - Callback khi lưu xong — cập nhật state ở parent.
 */
export default function SceneCard({
  scene,
  onSaved,
}: {
  scene: Scene;
  onSaved: (saved: Scene) => void;
}) {
  const [title, setTitle] = useState(scene.title);
  const [summary, setSummary] = useState(scene.summary);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /**
   * Lưu scene on blur: gọi updateScene với title + summary hiện tại.
   * Bỏ qua khi không có thay đổi (isDirty false).
   */
  async function handleBlur() {
    if (!isDirty) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const saved = await updateScene(scene.id, title, summary);
      setIsDirty(false);
      onSaved(saved);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Không thể lưu scene.");
    } finally {
      setIsSaving(false);
    }
  }

  const hasContent = title.trim() !== "" || summary.trim() !== "";
  const status = deriveStatus(hasContent ? title || summary : null, isDirty);
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
      {isSaving && <p className="mt-1 text-xs text-muted">đang lưu…</p>}
      {saveError && (
        <p className="mt-1 text-xs text-vermilion dark:text-terracotta">
          {saveError}
        </p>
      )}
    </div>
  );
}
