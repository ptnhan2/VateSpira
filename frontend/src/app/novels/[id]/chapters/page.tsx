"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import {
  deleteChapter,
  listChapters,
  updateChapterWordCount,
  type Chapter,
} from "@/lib/chapters";

/** Manuscript file từ /api/novels/[id]/manuscript. */
interface ManuscriptFile {
  path: string;
  content: string;
}

/**
 * Chapters tab — danh sách chương + reader/editor (tự chứa, không chat).
 *
 * Hiển thị tất cả chapters của novel. Click chapter → reader hiện prose
 * (từ StoreBackend). Nút "Sửa" → edit mode (textarea + Lưu/Hủy).
 * Nút "Xoá" → confirm → delete from DB.
 */
export default function ChaptersPage() {
  const params = useParams<{ id: string }>();
  const novelId = params.id;

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Chapter | null>(null);
  const [prose, setProse] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [manuscriptFiles, setManuscriptFiles] = useState<ManuscriptFile[]>([]);

  /** Refresh chapter list từ Supabase. */
  async function refreshChapters() {
    try {
      setChapters(await listChapters(novelId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể tải chapters.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!novelId) return;
    void refreshChapters();
    void fetch(`/api/novels/${novelId}/manuscript`)
      .then((res) => res.json())
      .then((data) =>
        setManuscriptFiles(
          (data.files as ManuscriptFile[]) ?? [],
        ),
      )
      .catch(() => {});
  }, [novelId]);

  /** Click chapter → load prose. */
  function handleSelect(chapter: Chapter) {
    setSelected(chapter);
    setProse(null);
    setFilePath(null);
    const match = manuscriptFiles.find(
      (f) =>
        f.path.includes(`chapter_${chapter.number}`) ||
        f.path.includes(`ch-${chapter.number}`) ||
        f.path.includes(`${chapter.number}.md`),
    );
    setFilePath(match?.path ?? null);
    setProse(match?.content ?? null);
  }

  /** Xoá chapter. */
  async function handleDelete(chapterId: string) {
    try {
      await deleteChapter(chapterId);
      setChapters((prev) => prev.filter((c) => c.id !== chapterId));
      if (selected?.id === chapterId) setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể xoá chapter.");
    }
  }

  /** Lưu prose đã sửa. */
  async function handleSave(newContent: string) {
    if (!filePath || !selected) return;
    await fetch(`/api/novels/${novelId}/manuscript`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: filePath, content: newContent }),
    });
    await updateChapterWordCount(selected.id, newContent);
    setProse(newContent);
    setSelected({
      ...selected,
      word_count: newContent.trim()
        ? newContent.trim().split(/\s+/).length
        : 0,
    });
  }

  if (loading)
    return <p className="py-8 text-center text-sm text-muted">Đang tải…</p>;

  return (
    <div className="mx-auto max-w-3xl">
      {error && (
        <p className="mb-4 rounded-lg border border-vermilion/20 bg-vermilion-soft p-3 text-sm text-vermilion dark:text-terracotta">
          {error}
        </p>
      )}

      {/* Chapter list */}
      {!selected && (
        <div>
          <div className="flex items-baseline justify-between border-b border-line pb-2">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-vermilion dark:text-terracotta">
              Chương đã viết
            </h2>
            <span className="font-mono text-[11px] text-muted">
              {chapters.length} chương
            </span>
          </div>
          {chapters.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">
              Chưa có chương. Vào tab Plot, viết outline cho scene rồi click
              &ldquo;Viết chương&rdquo;.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {chapters.map((chapter) => (
                <li key={chapter.id} className="flex items-center gap-3 py-3">
                  <span className="font-mono text-sm text-vermilion dark:text-terracotta">
                    {String(chapter.number).padStart(2, "0")}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSelect(chapter)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate font-serif text-[15px] text-ink hover:text-vermilion dark:hover:text-terracotta">
                      {chapter.title ?? "Chưa đặt tên"}
                    </span>
                  </button>
                  <span
                    className={`h-2 w-2 flex-none rounded-full ${chapter.status === "final" ? "bg-sage" : chapter.status === "revised" ? "bg-vermilion dark:bg-terracotta" : "border border-muted"}`}
                  />
                  <span className="font-mono text-xs text-muted">
                    {chapter.word_count}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(`Xoá chương ${chapter.number}?`)
                      ) {
                        void handleDelete(chapter.id);
                      }
                    }}
                    className="text-xs text-muted transition-colors hover:text-vermilion dark:hover:text-terracotta"
                  >
                    Xoá
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Chapter reader/editor */}
      {selected && (
        <ChapterReaderEditor
          chapter={selected}
          prose={prose}
          canEdit={!!filePath}
          onBack={() => setSelected(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

/** Chapter reader + editor (inline trong Chapters tab). */
function ChapterReaderEditor({
  chapter,
  prose,
  canEdit,
  onBack,
  onSave,
}: {
  chapter: Chapter;
  prose: string | null;
  canEdit: boolean;
  onBack: () => void;
  onSave: (content: string) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  function handleStartEdit() {
    setEditContent(prose ?? "");
    setIsEditing(true);
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      await onSave(editContent);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="font-mono text-xs text-muted">
            Chương {chapter.number}
          </p>
          <h2 className="mt-0.5 font-serif text-xl font-semibold text-ink">
            {chapter.title ?? "Chưa đặt tên"}
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
            onClick={onBack}
            className="text-xs text-muted transition-colors hover:text-ink"
          >
            ← Quay lại
          </button>
        </div>
      </div>

      <div className="mb-4 flex gap-3 text-xs text-muted">
        <span className="rounded-full border border-line px-2 py-0.5">
          {chapter.status === "final"
            ? "Hoàn thành"
            : chapter.status === "revised"
              ? "Đã sửa"
              : "Bản nháp"}
        </span>
        <span className="font-mono">{chapter.word_count} từ</span>
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
            className="w-full resize-y rounded-lg border border-line bg-paper px-3 py-2 font-serif text-[15px] leading-relaxed text-ink outline-none focus:border-vermilion dark:focus:border-terracotta"
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-lg bg-sage px-4 py-2 text-sm font-medium text-cream hover:opacity-90 disabled:opacity-50"
            >
              {isSaving ? "Đang lưu…" : "Lưu"}
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:text-ink"
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
