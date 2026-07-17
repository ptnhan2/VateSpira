"use client";

import { useEffect, useState } from "react";
import {
  ACT_LABELS,
  STC_BEATS,
  createBeat,
  deriveStatus,
  listBeats,
  updateBeat,
  type Beat,
} from "@/lib/beats";
import {
  createScene,
  deleteScene,
  listScenes,
  type Scene,
} from "@/lib/scenes";
import { listChapters, type Chapter } from "@/lib/chapters";
import SceneCard from "./plot/scene-card";

/**
 * Beat đã merge cấu trúc StC (act + hint) với DB row (id + content).
 * `id` null khi DB chưa có row (init_beats chưa chạy).
 */
interface MergedBeat extends Beat {
  act: 1 | 2 | 3;
  hint: string;
}

/**
 * Gộp 15 beat StC (cấu trúc cố định) với DB rows theo `beat_number`.
 * DB row cung cấp id + content; beat thiếu → id null, content null.
 * @param dbBeats - Mảng beat từ Supabase.
 * @param novelId - UUID novel (dự phòng khi DB row thiếu novel_id).
 * @returns 15 MergedBeat theo thứ tự narrative.
 */
function mergeBeats(dbBeats: Beat[], novelId: string): MergedBeat[] {
  return STC_BEATS.map((stc) => {
    const db = dbBeats.find((b) => b.beat_number === stc.beat_number);
    return {
      id: db?.id ?? null,
      novel_id: db?.novel_id ?? novelId,
      beat_number: stc.beat_number,
      beat_name: db?.beat_name ?? stc.beat_name,
      content: db?.content ?? null,
      status: db?.status ?? null,
      created_at: db?.created_at ?? null,
      updated_at: db?.updated_at ?? null,
      act: stc.act,
      hint: stc.hint,
    };
  });
}

/**
 * PlotContent — beat sheet 15 nhịp Save the Cat + scenes.
 *
 * Fetch beats + scenes qua Supabase browser client, render 15 slot nhóm
 * theo 3 hồi. Mỗi slot editable (beat content + scene title/summary/outline),
 * auto-save on blur. Scene card có nút "Viết chương" khi có outline.
 *
 * @param novelId - UUID novel.
 * @param onWriteChapter - Callback khi click "Viết chương" trên scene card.
 */
export default function PlotContent({
  novelId,
  onWriteChapter,
  onEditChapter,
  refreshKey = 0,
}: {
  novelId: string;
  onWriteChapter: (scene: Scene) => void;
  onEditChapter: (scene: Scene) => void;
  refreshKey?: number;
}) {
  const [beats, setBeats] = useState<MergedBeat[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!novelId) return;
    let cancelled = false;
    Promise.allSettled([listBeats(novelId), listScenes(novelId), listChapters(novelId)])
      .then(([beatsResult, scenesResult, chaptersResult]) => {
        if (beatsResult.status === "fulfilled") {
          setBeats(mergeBeats(beatsResult.value, novelId));
        } else {
          setError(
            beatsResult.reason instanceof Error
              ? beatsResult.reason.message
              : "Không thể tải beat sheet.",
          );
          setBeats(mergeBeats([], novelId));
        }
        if (scenesResult.status === "fulfilled") {
          setScenes(scenesResult.value);
        }
        if (chaptersResult.status === "fulfilled") {
          setChapters(chaptersResult.value);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [novelId, refreshKey]);

  /**
   * Callback khi một beat lưu xong — cập nhật id/content vào state.
   * @param beatNumber - Số thứ tự beat.
   * @param saved - Beat trả về từ Supabase (kèm id mới nếu vừa create).
   */
  function handleSaved(beatNumber: number, saved: Beat) {
    setBeats((prev) =>
      prev.map((b) =>
        b.beat_number === beatNumber
          ? {
              ...b,
              id: saved.id,
              content: saved.content,
              status: saved.status,
              updated_at: saved.updated_at,
            }
          : b,
      ),
    );
  }

  /**
   * Callback khi một scene lưu xong — cập nhật scene trong state.
   * @param saved - Scene trả về từ Supabase.
   */
  function handleSceneSaved(saved: Scene) {
    setScenes((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
  }

  /**
   * Callback khi tạo scene mới — thêm vào state.
   * @param scene - Scene vừa tạo.
   */
  function handleSceneAdded(scene: Scene) {
    setScenes((prev) => [...prev, scene]);
  }

  /** Xoá scene — gọi deleteScene, cập nhật state. */
  async function handleDeleteScene(sceneId: string) {
    try {
      await deleteScene(sceneId);
      setScenes((prev) => prev.filter((s) => s.id !== sceneId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể xoá scene.");
    }
  }

  return (
    <div className="max-w-3xl">
      {loading && <p className="mt-4 text-sm text-muted">Đang tải beat sheet…</p>}

      {!loading && error && (
        <div className="mt-4 rounded-lg border border-vermilion/20 bg-vermilion-soft p-4 text-sm text-vermilion dark:text-terracotta">
          {error}
        </div>
      )}

      {/* Chapter list đã chuyển sang tab Chapters */}

      {!loading &&
        ([1, 2, 3] as const).map((act) => (
          <section key={act} className="mt-6 first:mt-0">
            <div className="flex items-baseline justify-between border-b border-line pb-2">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">
                {ACT_LABELS[act].name}
              </h2>
              <span className="font-mono text-[11px] text-muted">
                {ACT_LABELS[act].range}
              </span>
            </div>
            {beats
              .filter((b) => b.act === act)
              .map((beat) => (
                <BeatSlot
                  key={beat.beat_number}
                  novelId={novelId}
                  beat={beat}
                  onSaved={handleSaved}
                  scenes={
                    beat.id
                      ? scenes.filter((s) => s.beat_id === beat.id)
                      : []
                  }
                  chapterNumbers={new Set(chapters.map((c) => c.number))}
                  onSceneSaved={handleSceneSaved}
                  onSceneAdded={handleSceneAdded}
                  onWriteChapter={onWriteChapter}
                  onEditChapter={onEditChapter}
                  onDeleteScene={handleDeleteScene}
                />
              ))}
          </section>
        ))}
    </div>
  );
}

/**
 * Một slot beat — số + chấm trạng thái + tên + textarea editable.
 * Component riêng để UF-3 có thể extend (nest scenes) mà không redesign.
 */
function BeatSlot({
  novelId,
  beat,
  onSaved,
  scenes,
  chapterNumbers,
  onSceneSaved,
  onSceneAdded,
  onWriteChapter,
  onEditChapter,
  onDeleteScene,
}: {
  novelId: string;
  beat: MergedBeat;
  onSaved: (beatNumber: number, saved: Beat) => void;
  scenes: Scene[];
  chapterNumbers: Set<number>;
  onSceneSaved: (saved: Scene) => void;
  onSceneAdded: (scene: Scene) => void;
  onWriteChapter: (scene: Scene) => void;
  onEditChapter: (scene: Scene) => void;
  onDeleteScene: (sceneId: string) => void;
}) {
  const [content, setContent] = useState(beat.content ?? "");
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  /** Lưu beat on blur: có id → update, thiếu id → create (resilient). */
  async function handleBlur() {
    if (!isDirty) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const saved = beat.id
        ? await updateBeat(beat.id, content)
        : await createBeat(novelId, beat.beat_number, beat.beat_name, content);
      setIsDirty(false);
      onSaved(beat.beat_number, saved);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Không thể lưu beat.");
    } finally {
      setIsSaving(false);
    }
  }

  /** Tạo scene mới thuộc beat này. Scene number = max(existing) + 1. */
  async function handleAddScene() {
    if (!beat.id) return;
    const nextNumber =
      scenes.length > 0
        ? Math.max(...scenes.map((s) => s.scene_number)) + 1
        : 1;
    try {
      const created = await createScene(
        novelId,
        beat.id,
        nextNumber,
        "",
        "",
      );
      onSceneAdded(created);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Không thể tạo scene.");
    }
  }

  const status = deriveStatus(content, isDirty);
  const dotClass =
    status === "filled"
      ? "bg-sage"
      : status === "draft"
        ? "bg-vermilion"
        : "border border-muted";

  return (
    <div
      data-testid={`beat-${beat.beat_number}`}
      className="flex gap-4 border-b border-line py-4"
    >
      <div className="flex w-9 flex-none flex-col items-center gap-2 pt-1">
        <span className="font-mono text-sm text-vermilion dark:text-terracotta">
          {String(beat.beat_number).padStart(2, "0")}
        </span>
        <span
          data-status={status}
          className={`h-2 w-2 rounded-full ${dotClass}`}
          aria-label={`trạng thái: ${status}`}
        />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-serif text-lg font-semibold text-ink">
          {beat.beat_name}
        </h3>
        <p className="mt-0.5 text-xs text-muted">{beat.hint}</p>
        <textarea
          aria-label={`Nội dung ${beat.beat_name}`}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setIsDirty(true);
          }}
          onBlur={handleBlur}
          placeholder="Viết nội dung beat này…"
          className="mt-2 w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 font-serif text-[15px] leading-relaxed text-ink outline-none transition-colors focus:border-vermilion dark:focus:border-terracotta"
        />
        {isSaving && <p className="mt-1 text-xs text-muted">đang lưu…</p>}
        {saveError && (
          <p className="mt-1 text-xs text-vermilion dark:text-terracotta">
            {saveError}
          </p>
        )}

        {isExpanded && (
          <div className="mt-3 ml-4 border-l-2 border-line pl-4">
            {scenes.map((scene) => (
                <SceneCard
                  key={scene.id}
                  scene={scene}
                  hasChapter={chapterNumbers.has(scene.scene_number)}
                  onSaved={onSceneSaved}
                  onWriteChapter={onWriteChapter}
                  onEditChapter={onEditChapter}
                  onDelete={onDeleteScene}
                />
            ))}
            {beat.id ? (
              <button
                type="button"
                onClick={handleAddScene}
                className="mt-2 text-xs text-muted transition-colors hover:text-vermilion dark:hover:text-terracotta"
              >
                + Thêm scene
              </button>
            ) : (
              <p className="mt-2 text-xs italic text-muted">
                Viết nội dung beat trước khi thêm scene.
              </p>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        data-testid={`expand-${beat.beat_number}`}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-label={isExpanded ? "Thu gọn scenes" : "Mở rộng scenes"}
        aria-expanded={isExpanded}
        className="flex items-center gap-1 self-start pt-1 text-muted transition-colors hover:text-ink"
      >
        <span
          className="inline-block h-2 w-2 border-r-[1.5px] border-b-[1.5px] border-current transition-transform"
          style={{
            transform: isExpanded ? "rotate(45deg)" : "rotate(-45deg)",
          }}
        />
        <span className="font-mono text-[10px]">{scenes.length}</span>
      </button>
    </div>
  );
}
